/**
 * Benny's Ballista — level data and the ASCII-layer parser.
 *
 * A castle is a stack of 2D ASCII pictures, front layer first (nearest the
 * ballista) — same letters and merge rule as the old 2D game's single-picture
 * `LEVELS`, extended with depth. Two merges happen, both only for
 * `mergeable` materials (never small rubble, never a one-off piece like `T`
 * or `K`):
 *
 *   - ROW merge (x). A run of the same letter side by side in one row welds
 *     into one wide rigid body, exactly as the 2D version did.
 *   - LAYER merge (z). The *same* run (same row, same columns, same letter)
 *     repeated in the next layer back welds into one deep body too, so a
 *     wall drawn identically on several layers is one slab, not N thin
 *     plates standing shoulder to shoulder.
 *
 * Because layers sit in their own z-slice with no vertical overlap between
 * them, **each layer has to stand on its own** — a block only rests on
 * whatever is directly below it in the *same* layer. That is what makes a
 * front wall a genuine sightline obstruction rather than a support for
 * anything behind it: knock it down and the layers behind are unaffected
 * structurally, only newly visible/reachable.
 *
 * Authoring tricks that carry over unchanged from the 2D game, now doubled
 * by having a Z axis as well as an X one:
 *   - CLADDING. Put `S` in front of a `W` (same row, same column, earlier
 *     layer) and the wood is armoured — a shot has to get through the stone
 *     first.
 *   - WINDOWS. Put `I` in front of anything and the same shot shatters the
 *     glass and carries on into whatever it was hiding.
 *   - DEPTH. A solid front layer can hide a back layer's crown from a flat
 *     shot entirely — reaching it needs a lob that clears the front layer's
 *     height, or knocking the front layer down first.
 */
RT.levels = (function () {
  'use strict';

  const D = RT.data;
  const MAT = D.MAT;

  /** One block is one world unit, matching data.js's coordinate note and
   *  physics.js's happy range for Bullet. */
  const CELL = 1.0;

  /** How much of a cell's vertical budget a `plank:true` material (js/data.js's
   *  `B`) claims, sitting flush on its own row's floor rather than filling the
   *  cell like every other material. Tunable — not a locked design constant. */
  const PLANK_FRAC = 0.15;

  /** The merge runs within ONE row — the single definition of what welds
   *  together side by side. rowRuns() walks a whole layer with it, and
   *  rowBottoms() needs the very same grouping to give a welded run one
   *  shared floor, so the two cannot drift apart. `row` is a row STRING or a
   *  char ARRAY (the editor's `doc.grid[l][r]`); `row[c]` reads the same
   *  either way. `width` defaults to the row's own length — parseLevel passes
   *  the layer's full column count so a short/ragged row still reports runs
   *  in the same coordinate space as every other row. */
  function runsInRow(row, width) {
    const runs = [];
    const n = (width !== undefined) ? width : (row ? row.length : 0);
    let c = 0;
    while (c < n) {
      const ch = row ? row[c] : undefined;
      if (ch === undefined || ch === '.' || ch === ' ') { c++; continue; }
      const mat = MAT[ch];
      if (!mat) { c++; continue; }
      let len = 1;
      if (mat.mergeable) { while (c + len < n && row[c + len] === ch) len++; }
      runs.push({ col: c, len: len, matId: ch, small: !!mat.small });
      c += len;
    }
    return runs;
  }

  /** Same-letter runs within one row of one layer, exactly as the 2D
   *  version's buildLevel() found them. */
  function rowRuns(rows) {
    const runs = [];
    for (let r = 0; r < rows.length; r++) {
      for (const run of runsInRow(rows[r])) {
        runs.push({ row: r, col: run.col, len: run.len, matId: run.matId, small: run.small });
      }
    }
    return runs;
  }

  /** World Z of layer `i` in a castle `numLayers` deep, centred on `dist`.
   *  Layer 0 is nearest the ballista (least negative Z). Promoted out of
   *  parseLevel()'s closure (where it started life as a one-off arrow
   *  function) so a caller that needs to place a single cell — the level
   *  editor mapping a mouse ray back to a cell, not a full re-parse — has the
   *  exact inverse of parseLevel()'s own placement maths to call instead of
   *  re-deriving it and risking the two drifting apart.
   *
   *  `centerLayer` (optional) overrides the default `(numLayers-1)/2` centre.
   *  A FINISHED level always wants the default (naturally centred on its own
   *  true depth) — only the EDITOR passes an explicit, persistent centre: its
   *  depth grows one layer at a time as you work, and the default's centre
   *  moves every time `numLayers` does, dragging every ALREADY-placed layer's
   *  Z sideways along with it even though nothing about that layer changed.
   *  Passing a centre that only moves when a layer is actually inserted IN
   *  FRONT of existing content (see editor.js's `doc.centerLayer`) keeps
   *  everything else exactly where it was. */
  function layerZ(dist, numLayers, i, centerLayer) {
    const c = (centerLayer !== undefined) ? centerLayer : (numLayers - 1) / 2;
    return -dist + (c - i) * CELL;
  }

  /** Real vertical space one CELL claims — CELL for an ordinary occupant,
   *  but a `plank`/`B` cell claims only PLANK_FRAC*CELL and a small-rubble
   *  cell claims 0.5*CELL. Empty ('.'/space) keeps a full CELL of reserved
   *  authoring space, same as an ordinary occupant, so a row with nothing in
   *  it yet still stacks like a plain full-height row.
   *
   *  Per-CELL, not per-row: an earlier version measured this per row (the
   *  tallest occupant anywhere across the row's full width), which let one
   *  unrelated column's tall content inflate the floor under every other
   *  column sharing that row index — paste a stone block two columns over
   *  from a board bridge, in a row that used to be entirely thin content,
   *  and the bridge (and everything resting on it) would silently jump up to
   *  full-CELL height. A saved sub-assembly has to sit the same way wherever
   *  it's placed, so each column now tracks only what's actually stacked
   *  beneath it. */
  function cellThickness(ch) {
    if (ch === undefined || ch === '.' || ch === ' ') return CELL;
    const mat = MAT[ch];
    if (!mat) return CELL;
    return mat.plank ? CELL * PLANK_FRAC : (mat.small ? CELL * 0.5 : CELL);
  }

  /** Cumulative floor height for every (row, col) of one layer —
   *  bottoms[row][col] is the sum of cellThickness() for every row BELOW it
   *  IN THAT SAME COLUMN (row index increases downward; the true floor row's
   *  bottom is 0). Replaces the old `(rows - row - 1) * CELL` assumption
   *  everywhere a row's real height might not be a full CELL — and, per
   *  cellThickness()'s note above, replaced a row-wide version of this same
   *  idea that let columns interfere with each other.
   *
   *  `layerRows` is one layer's array of row pictures — either a real level's
   *  row STRINGS (`level.layers[i]`) or the editor's row CHAR-ARRAYS
   *  (`doc.grid[l]`); `row[c]` reads identically either way, so this one
   *  function serves both callers. */
  function rowBottoms(layerRows, rows, cols) {
    const bottoms = [];
    for (let r = 0; r < rows; r++) bottoms.push(new Array(cols).fill(0));
    const acc = new Array(cols).fill(0);
    const n = Math.min(layerRows ? layerRows.length : 0, rows);
    const shared = new Array(cols);
    for (let r = rows - 1; r >= 0; r--) {
      const row = r < n ? layerRows[r] : null;
      /* Cells that WELD into one rigid body share ONE floor — the highest
         under any column the run spans — because that shared floor is the
         single Y parseLevel() gives the merged body, and its flat top is
         what the next row up actually rests on. Per-column accumulation
         alone (what this did before) disagreed with the geometry the moment
         a run's columns sat at different heights, which is exactly what a
         thin `B` board or a half-size `w/s/i` chunk under ONE column of a
         run creates: the body was drawn on the tallest column's floor while
         every other column still reported its own, up to 0.85 CELL lower.
         Everything that reads a cell's floor off this — the editor's cell
         picker and its ghost preview especially — then pointed at a spot
         the block was not drawn in. */
      shared.fill(-1);
      if (row) {
        for (const run of runsInRow(row, cols)) {
          if (run.len < 2) continue;                    // nothing welded, nothing to share
          let top = 0;
          for (let c = run.col; c < run.col + run.len; c++) top = Math.max(top, acc[c]);
          for (let c = run.col; c < run.col + run.len; c++) shared[c] = top;
        }
      }
      for (let c = 0; c < cols; c++) {
        // -1 is the sentinel for "not part of a welded run"; a real floor is
        // never negative, and 0 (the true ground row) is a legitimate share.
        const bottom = shared[c] >= 0 ? shared[c] : acc[c];
        bottoms[r][c] = bottom;
        acc[c] = bottom + cellThickness(row ? row[c] : undefined);
      }
    }
    return bottoms;
  }

  /** World-space centre of one grid CELL — not of a merged block, which can
   *  span several cells and isn't what a mouse click ever targets. Always a
   *  full CELL cube regardless of what (if anything) occupies it, so a thin
   *  `B` plank or a half-size `w/s/i` chunk is exactly as easy to pick as a
   *  full block. `dims` is `{cols, rows, numLayers}`, i.e. parseLevel()'s own
   *  return shape (or the `_cols`/`_depth` pair cached onto a level, plus its
   *  layer count) — same convention data.js's castleBounds() reads.
   *
   *  `bottoms` (optional) is a rowBottoms()-shaped [row][col] array for THIS
   *  specific layer — pass it whenever real grid content for that layer
   *  exists, so picking/ghost placement agrees with where parseLevel() will
   *  actually put things. Omitted (no grid content to base it on yet), this
   *  falls back to the old uniform-CELL assumption.
   *
   *  `dims.centerCol`/`dims.centerLayer` (optional) override the default
   *  `dims.cols/2` / layerZ's own default centre — see layerZ's note on why:
   *  X is centred on total COLUMN count exactly the way Z is centred on
   *  total LAYER count, so growing the column count during editing shifts
   *  every already-placed column sideways for the same reason growing the
   *  layer count shifts every layer in Z. Only the editor ever passes these
   *  (its `doc.centerCol`/`doc.centerLayer`); a finished level always wants
   *  the natural, true-dimensions centre. */
  function cellCentre(dist, dims, layer, row, col, bottoms) {
    const bottom = (bottoms && bottoms[row] && bottoms[row][col] !== undefined) ? bottoms[row][col] : (dims.rows - row - 1) * CELL;
    const centerCol = (dims.centerCol !== undefined) ? dims.centerCol : dims.cols / 2;
    return {
      x: (col + 0.5 - centerCol) * CELL,
      y: bottom + CELL / 2,
      z: layerZ(dist, dims.numLayers, layer, dims.centerLayer),
      size: CELL
    };
  }

  /**
   * Parses one level's stacked layers into plain block specs in world units
   * — {matId, x, y, z, w, h, d} — ready to hand to js/physics.js and
   * js/art.js. Pure; spawns nothing itself, so both js/game.js and
   * editor.html can call it.
   */
  function parseLevel(level) {
    const layers = level.layers;
    const numLayers = layers.length;
    let cols = 0, rows = 0;
    for (const layer of layers) {
      rows = Math.max(rows, layer.length);
      for (const row of layer) cols = Math.max(cols, row.length);
    }

    const layerRuns = layers.map(rowRuns);
    const used = layerRuns.map((runs) => runs.map(() => false));
    const blocks = [];
    let crownCount = 0;

    // Real per-cell floor height, one [row][col] grid per layer (each layer
    // stands on its own — see the file header — so a board in layer 0 never
    // affects layer 1's heights, and per cellThickness()'s note, one column
    // never affects another sharing its row). This is what makes something
    // resting above a board/rubble cell sit flush on its actual surface
    // instead of assuming every row below is a full CELL tall.
    const layerBottoms = layers.map((layerRows) => rowBottoms(layerRows, rows, cols));

    // Layer 0 is nearest the ballista (least negative Z); layers stack away
    // from it in even CELL-wide steps, centred on level.dist. `lz` rather than
    // shadowing the module-level layerZ() above — same maths, this closure
    // just bakes in level.dist/numLayers so every call site below doesn't
    // have to repeat them. `level.centerCol`/`level.centerLayer` (optional —
    // only the editor ever sets them, see layerZ()'s/cellCentre()'s notes)
    // keep an in-progress castle's already-placed content from sliding
    // sideways/in-depth every time the document grows during editing; a
    // finished level omits them and gets the natural, true-dimensions centre.
    const centerCol = (level.centerCol !== undefined) ? level.centerCol : cols / 2;
    const lz = (i) => layerZ(level.dist, numLayers, i, level.centerLayer);

    for (let li = 0; li < numLayers; li++) {
      const runs = layerRuns[li];
      for (let ri = 0; ri < runs.length; ri++) {
        if (used[li][ri]) continue;
        const run = runs[ri];
        used[li][ri] = true;
        const mat = MAT[run.matId];
        if (run.matId === 'K') crownCount++;

        let endLayer = li;
        if (mat.mergeable && !run.small) {
          // A layer merge welds this run to the identical run behind it — but
          // only if that run actually sits at the SAME height. Two runs on
          // different floors are not one rigid body, and welding them anyway
          // drew the pair at the front layer's height, silently lifting (or
          // dropping) the back one off the floor its own layer put it on —
          // the depth-axis twin of the row-run mismatch rowBottoms() fixes.
          // Only a thin/half-height piece under one of the layers can make
          // the floors differ, so ordinary full-cell castles merge exactly as
          // they always did.
          const myBottom = layerBottoms[li][run.row][run.col];
          for (let nl = li + 1; nl < numLayers; nl++) {
            const idx = layerRuns[nl].findIndex((r2, i2) => !used[nl][i2] &&
              r2.row === run.row && r2.col === run.col &&
              r2.len === run.len && r2.matId === run.matId);
            if (idx === -1) break;
            if (Math.abs(layerBottoms[nl][run.row][run.col] - myBottom) > 1e-6) break;
            used[nl][idx] = true;
            endLayer = nl;
          }
        }

        let x, y, z, w, h, d;
        if (run.small) {
          w = h = d = CELL * 0.5;
          x = (run.col + 0.5 - centerCol) * CELL;
          y = layerBottoms[li][run.row][run.col] + h / 2;   // resting on its cell's REAL floor
          z = lz(li);
        } else {
          w = run.len * CELL;
          h = mat.plank ? CELL * PLANK_FRAC : CELL;
          d = (endLayer - li + 1) * CELL;
          x = (run.col + run.len / 2 - centerCol) * CELL;
          // A merged run is one rigid body, so it needs one shared Y — the
          // tallest real floor under any column it actually spans (never a
          // column outside its own footprint; that's the per-cell fix above).
          // rowBottoms() now hands back that shared floor on every column of
          // the run already, so this max only re-confirms it — kept because
          // it is what DEFINES the shared Y, and anything that reads a floor
          // per cell has to agree with it rather than the other way round.
          let bottom = 0;
          for (let cc = run.col; cc < run.col + run.len; cc++) bottom = Math.max(bottom, layerBottoms[li][run.row][cc]);
          y = bottom + h / 2;
          z = (lz(li) + lz(endLayer)) / 2;
        }
        // layer/endLayer/row/col/len/small are pure provenance — nothing here
        // reads them back, but a caller that wants to report a failure in cell
        // coordinates ("crown at layer 5, row 6, col 7") rather than raw world
        // x/y/z needs them, and every value already exists in this scope.
        blocks.push({ matId: run.matId, x: x, y: y, z: z, w: w, h: h, d: d,
                      layer: li, endLayer: endLayer, row: run.row, col: run.col,
                      len: run.len, small: !!run.small });
      }
    }

    return { blocks: blocks, cols: cols, rows: rows, numLayers: numLayers, crownCount: crownCount };
  }

  /**
   * Which pairs of parseLevel() blocks are bonded into one structural
   * assembly — returned as `[i, j]` index pairs into the array passed in, for
   * js/physics.js's addWeld() to realise as real Bullet constraints. Pure
   * geometry; knows nothing about bodies.
   *
   * A weld joins two SEPARATE bodies that keep their own hp, which is what
   * makes it the right tool where a merge is the wrong one. The row/depth
   * merges in parseLevel() above can only fuse a straight run into a single
   * box, so a span that turns a corner necessarily comes out as several
   * bodies — and each of those is then judged on what sits directly beneath
   * it ALONE, which for the middle of a span is nothing at all. That is why a
   * board frame (a floor running around an open shaft: a span across the
   * front, a span across the back, and a rail down each side through depth)
   * used to drop out the instant a level loaded even though it is supported at
   * all four corners. Welded, the frame is one assembly resting on those
   * corners, exactly as its author drew it; destroy any one board and only
   * that board dies, freeing whatever it was holding to fall.
   *
   * The rule is deliberately narrow — ONE side must be `weld:true` (only `B`
   * today, see js/data.js), and the contact must be genuinely face-to-face.
   * A board bonds to whatever it actually touches, whatever that is: the
   * post under it, the stone beside it, a guard standing on it. Everything
   * else in the castle is left to Bullet's contact solver exactly as before,
   * so only the thin spanning pieces — the ones with no support under their
   * middle, which is the whole reason `B` exists — get held rigid. Welding
   * EVERY touching pair instead was tried and reverted: it passes the audit
   * but fuses a castle into one lump that no longer tumbles when it breaks.
   *
   * Two blocks that meet along an edge or at a corner only, with no shared
   * face area, are not bonded: nothing is load-bearing there. And a weld
   * needs CONTACT — a board drawn with empty cells beneath it touches
   * nothing, so nothing bonds to it and it still falls. That is a level
   * data problem, not something this rule can reach.
   */
  /**
   * How hard one bond may be pushed before it lets go, for js/physics.js's
   * addWeld() — 0 meaning "only ever ends when one of its blocks dies".
   * Lives here, next to weldPairs(), because the game and the editor's
   * stability test both build the same castle and a bond that behaves
   * differently between them would make the test lie.
   *
   * Three cases, weakest first:
   *
   *   A PROP on a surface — the crown or a guard standing on something.
   *   These are welded at all only so they don't slide or topple off a
   *   narrow perch while the castle is merely standing. They must come free
   *   the moment anything actually happens to them, or a guard rides its
   *   board all the way down like it was nailed there, which is exactly what
   *   the weld was never meant to buy.
   *
   *   A LATERAL bond — boards meeting end-on or face-on across a span. Holds
   *   a frame together, breaks under a solid hit so the span can be knocked
   *   loose. See CFG.LATERAL_WELD_BREAK for the measured window.
   *
   *   A STACKED bond holding something UP — a board resting on its post.
   *   Unbreakable: this one is load-bearing, and destroying the post already
   *   drops the weld with it (js/physics.js's removeWeldsFor).
   */
  function weldBreak(blockA, blockB, axis) {
    const a = MAT[blockA.matId], b = MAT[blockB.matId];
    const prop = (m) => m && (m.crown || m.guard);
    if (prop(a) || prop(b)) return D.CFG.PROP_WELD_BREAK;
    return axis === 'y' ? 0 : D.CFG.LATERAL_WELD_BREAK;
  }

  const WELD_EPS = 1e-6;
  function weldPairs(blocks) {
    const overlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
    const ext = blocks.map((b) => ({
      x0: b.x - b.w / 2, x1: b.x + b.w / 2,
      y0: b.y - b.h / 2, y1: b.y + b.h / 2,
      z0: b.z - b.d / 2, z1: b.z + b.d / 2,
      weld: !!(MAT[b.matId] && MAT[b.matId].weld)
    }));
    /* Which axis the two blocks meet on — 'y' when one sits on top of the
       other, 'x'/'z' when they meet side by side or front to back — or null
       when they don't share a face at all. Face contact on one axis needs
       POSITIVE overlap on the other two: an edge-on or corner-on meeting has
       zero area on at least one of them and carries no load.

       The axis is reported rather than a bare yes/no because a STACKED bond
       and a LATERAL one want different strengths. A board resting on a post
       is what stops a crown or a guard tipping off it, and should simply
       hold. The lateral bonds are the ones that tie a whole frame together
       across the castle, and holding those rigid is what makes a hit feel
       like it lands on one immovable lump — so callers give those a breaking
       threshold instead. */
    function contactAxis(A, B) {
      if (Math.abs(A.x1 - B.x0) < WELD_EPS || Math.abs(B.x1 - A.x0) < WELD_EPS) {
        return (overlap(A.y0, A.y1, B.y0, B.y1) > WELD_EPS && overlap(A.z0, A.z1, B.z0, B.z1) > WELD_EPS) ? 'x' : null;
      }
      if (Math.abs(A.y1 - B.y0) < WELD_EPS || Math.abs(B.y1 - A.y0) < WELD_EPS) {
        return (overlap(A.x0, A.x1, B.x0, B.x1) > WELD_EPS && overlap(A.z0, A.z1, B.z0, B.z1) > WELD_EPS) ? 'y' : null;
      }
      if (Math.abs(A.z1 - B.z0) < WELD_EPS || Math.abs(B.z1 - A.z0) < WELD_EPS) {
        return (overlap(A.x0, A.x1, B.x0, B.x1) > WELD_EPS && overlap(A.y0, A.y1, B.y0, B.y1) > WELD_EPS) ? 'z' : null;
      }
      return null;
    }
    /* `[i, j, axis]` — a caller that only wants the pair can still destructure
       `[i, j]` and ignore the third slot. */
    const pairs = [];
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        if (!ext[i].weld && !ext[j].weld) continue;
        const axis = contactAxis(ext[i], ext[j]);
        if (axis) pairs.push([i, j, axis]);
      }
    }
    return pairs;
  }

  /* ── Levels ───────────────────────────────────────────────────────────────
   * `dist` is the castle's centre distance downrange (see data.js's
   * castleBounds/rangeWindow) — retuned 2026-08-30 for real cinematic flight
   * time (measured by tracing real shots via traceShot(), not guessed):
   * at the short original 16-25 range, a flat/direct ammo's near-max-range
   * shot resolved in well under a second, too quick to watch the FLIGHT
   * camera actually chase it. Distances now sit as far out as each level's
   * available/needed ammo can safely reach — checked against
   * maxRange(speed) for every unlocked ammo at that level index, with the
   * rangeWindow's near/far pad and (for the four depth levels) each layer's
   * own half-depth folded in — so this is still exactly as reachable as the
   * original escalation, just slower to arrive. `js/game.js`'s auditLevels()
   * reverifies every castle still stands on every boot regardless, and
   * auditAmmoOffers() (backed by `js/data.js`'s ammoReachReport()) checks
   * the ammo-range arithmetic this paragraph describes — deterministically,
   * not by sampling.
   *
   * The first eight are single-layer castles, carried over from the 2D
   * game's LEVELS array (recovered from git history, commit bc731c9) since
   * their shapes are already known to stand on their own weight — depth
   * changes nothing about whether a layer stands, only what can see it. The
   * last four introduce depth, escalating from two layers to three.
   */
  const LEVELS = [
    { name: 'The Effigy', par: 1, bolts: 6, dist: 24, ammo: ['stone'], layers: [
  [
    '......',
    '......',
    '......',
    '......',
    '......',
    '......',
    '.W.W..'
  ],
  [
    'WWWWW.',
    'W...W.',
    'W.K.W.',
    'W.W.W.',
    'W.W.W.',
    'WWWWW.',
    'WWWWW.'
  ],
  [
    '......',
    '......',
    '......',
    '......',
    '......',
    '......',
    '.W.W..'
  ],
  [
    '......',
    '......',
    '......',
    '......',
    '......',
    '......',
    '......'
  ]
] },
    { name: 'The Monument', par: 2, bolts: 7, dist: 25, layers: [
  [
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    'Q...H',
    'S...S',
    'S...S'
  ],
  [
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '..S..',
    '.SSS.',
    '.SSS.'
  ],
  [
    '..K..',
    '..W..',
    '..W..',
    '.SWS.',
    '.SWS.',
    '.SWS.',
    '.SWS.',       // the centre column runs all the way to the floor — without
    '.SWS.',       // these three the crown's pillar stopped at row 5 and the
    '.SWS.'        // whole stack fell 2.3 units on load (auditLevels caught it)
  ],
  [
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '..S..',
    '.SSS.',
    '.SSS.'
  ],
  [
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    'S...S',
    'S...S'
  ]
] },
    { name: 'The Watchtower', par: 2, bolts: 7, dist: 26, layers: [
  [
    '.....WW.QWW..........',
    '.....BBBBBB..........',
    '.....W....W..........',
    '.....W....W..........',
    '.....BBBBBB..........',
    '.....W....W..........',
    '.....WQ...W..........',
    '.....BBBBBB..........',
    '.....W....W..........',
    '.....W...HW..........',
    '.....BBBBBB..........',
    '.....W....W..........',
    '.....W....W..........'
  ],
  [
    '.....................',
    '.....B....B..........',
    '.....................',
    '.....................',
    '.....B....B..........',
    '.....................',
    '.....................',
    '.....B....B..........',
    '.....................',
    '.....................',
    '.....B....B..........',
    '.....................',
    '.....................'
  ],
  [
    '.....................',
    '.....B....B..........',
    '.....................',
    '.....................',
    '.....B....B..........',
    '.....................',
    '.....................',
    '.....B....B..........',
    '.....................',
    '.....................',
    '.....B....B..........',
    '.....................',
    '.....................'
  ],
  [
    '.....................',
    '.....B....B..........',
    '.....................',
    '.....................',
    '.....B....B..........',
    '.....................',
    '.....................',
    '.....B....B..........',
    '.....................',
    '.....................',
    '.....B....B..........',
    '.....................',
    '.....................'
  ],
  [
    '.....................',
    '.....B....B..........',
    '.....................',
    '.....................',
    '.....B....B..........',
    '.....................',
    '.....................',
    '.....B....B..........',
    '.....................',
    '.....................',
    '.....B....B..........',
    '.....................',
    '.....................'
  ],
  [
    '.....WW.KWW..........',
    '.....BBBBBB..........',
    '.....W....W..........',
    '.....W..H.W..........',
    '.....BBBBBB..........',
    '.....W....W..........',
    '.....W....W..........',
    '.....BBBBBB..........',
    '.....W....W..........',
    '.....W....W..........',
    '.....BBBBBB..........',
    '.....W....W..........',
    '.....W....W..........'
  ],
  [
    '.....................',
    '.....................',
    '.....................',
    '.....................',
    '.....................',
    '.....................',
    '.....................',
    '.....................',
    '.....................',
    '.....................',
    '.....................',
    '.....................',
    '.....................'
  ]
] },
    { name: 'The Warehouse', par: 3, bolts: 7, dist: 27, ammo: ['stone', 'boulder', 'fire'], layers: [
  [
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '.S..........S.',
    'SSS........SSS'
  ],
  [
    '.....SSSS.....',
    '....SS..SS....',
    '....S....S....',
    'SSSSSSSSSSSSSS',
    '.W.Q........W.',
    '.WBBBBBBBBBBW.',
    '.W....WW....W.',
    '.W....WW....W.',
    'SWS...WW...SWS',
    'SSS...WW...SSS'
  ],
  [
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '.B..........B.',
    '..............',
    '..............',
    '.S..........S.',
    'SSS........SSS'
  ],
  [
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '.B..........B.',
    '..............',
    '..............',
    '..............',
    '..............'
  ],
  [
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '.B..........B.',
    '..............',
    '..............',
    '..............',
    '..............'
  ],
  [
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '.B..........B.',
    '..............',
    '..............',
    '..............',
    '..............'
  ],
  [
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '.B..........B.',
    '..............',
    '..............',
    '..............',
    '..............'
  ],
  [
    '..............',
    '..............',
    '..............',
    '..............',
    '.........Q....',
    '.BBBBBBBBBBBB.',
    '.W....WW....W.',
    '.W....WW....W.',
    '.W....WW....W.',
    '.W....WW....W.'
  ],
  [
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '.B..........B.',
    '..............',
    '..............',
    '..............',
    '..............'
  ],
  [
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '.B..........B.',
    '..............',
    '..............',
    '..............',
    '..............'
  ],
  [
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '.B..........B.',
    '..............',
    '..............',
    '..............',
    '..............'
  ],
  [
    '..............',
    '..............',
    '..............',
    '..............',
    '............H.',
    '.B..........B.',
    '..............',
    '..............',
    '..............',
    '..............'
  ],
  [
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '.B..........B.',
    '..............',
    '..............',
    '.S..........S.',
    'SSS........SSS'
  ],
  [
    '..............',
    '..............',
    '..............',
    'SSSSSSSSSSSSSS',
    '.W.H......K.W.',
    '.WBBBBBBBBBBW.',
    '.W....WW....W.',
    '.W....WW....W.',
    'SWS...WW...SWS',
    'SSS...WW...SSS'
  ],
  [
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '.S..........S.',
    'SSS........SSS'
  ]
] },
    { name: 'Glasshouse Keep', par: 2, bolts: 7, dist: 27, layers: [[
      '.K..K',
      '.W..W',
      '.W..W',
      'SW.IW',
      'IW.SW',
      'SW.SW'
    ]] },
    { name: 'Cliffside Fort', par: 2, bolts: 9, dist: 28, layers: [[
      '..K..K..K..',
      '..W..W..W..',
      'QWWWWTWWWWH',            // two guards flanking the ground floor, easy first look at one
      'XXXXXXXXXXX'
    ]] },
    { name: 'Powder Row', par: 3, bolts: 8, dist: 29, layers: [[
      '....K....',
      '.WWWWWWW.',
      'SW.....WS',
      'IT.....TI',
      'SW.....WS',
      'SW.....WS'
    ]] },
    { name: 'The Timberworks', par: 3, bolts: 9, dist: 27, layers: [[
      '.K.....K.',
      '.WWWWWWW.',
      '.W.....W.',
      '.T.....W.',
      '.W.....T.',
      '.W..s..W.'
    ]] },
    { name: 'Twin Halls', par: 3, bolts: 9, dist: 25, layers: [
      [                             // front — a blind stone wall, no crown
        '.....',
        '..H..',                    // a guard standing on the rampart, in full view
        'SSSSS',
        'SSSSS'
      ], [                          // back — the real target, behind it
        '..K..',
        '.WWW.',
        '.W.W.',
        '.W.W.'
      ]
    ] },
    { name: 'The Palisade', par: 3, bolts: 9, dist: 26, layers: [
      [                             // front
        '.....',
        'X...X',
        'X.T.X',
        'XXXXX'
      ], [                          // back — corner posts and the floor weld
        '..K..',                    // to the front layer's (layer merge)
        'X.W.X',
        'X.W.X',
        'XXXXX'
      ]
    ] },
    { name: 'The Deep Keep', par: 4, bolts: 11, dist: 27, layers: [
      [                             // front screen — thin, meant to fall first
        '.....',
        '.W.W.',
        '.W.W.',
        '.W.W.'
      ], [                          // middle wall — a gap down its centre
        '.....',
        'SSSSS',
        'S...S',
        'SSSSS'
      ], [                          // back — the crown, behind both
        '..K..',
        '.WWW.',
        '.W.W.',
        '.W.W.'
      ]
    ] },
    { name: "Benny's Bastion", par: 5, bolts: 13, dist: 27, layers: [
      [                             // front — twin outer crowns, spindly towers
        'K.......K',
        'W.......W',
        'W.......W',
        'W.......W'
      ], [                          // courtyard — a lone keg, nothing to protect it
        '.........',
        '.........',
        '....T....',
        'XXXXXXXXX'
      ], [                          // inner sanctum — the true crown, walled in
        '....K....',
        '.WWWWWWW.',
        '.W.....W.',
        '.WWWWWWW.'
      ]
    ] },
    /* The first two levels built around `B` (js/data.js's timber board) — a
     * thin, mergeable piece that sits flush on its own row's floor instead of
     * filling the cell, so a run of it can bridge a gap between two supports
     * with nothing but open air underneath. Both keep the crown a full empty
     * row below the board (never directly touching it), per the authoring
     * rule in README.md. */
    { name: 'The Bridge', par: 2, bolts: 7, dist: 28, layers: [[
      '..BBBBB..',   // the span itself — rests only on the two pillars below
      '..W...W..',   // pillar tops; the three middle columns are open shaft
      '..W.K.W..'    // pillar bases, and the crown standing in the open gap
    ]] },
    /* Deliberately NOT independently reachable — the point of this one.
     * The roof rests on two single-block pillars, each in turn resting on a
     * static steel ledge (steel needs no support underneath it — see
     * Cliffside Fort/The Palisade above — so the ledge can float over an
     * open pit with nothing propping it up). Destroy either single-block
     * pillar (one hit; nothing stacked above it to catch the gap the way a
     * taller pillar would) and the roof, now held at only one end, swings
     * down into the pit onto whatever's below — a genuine multi-unit fall,
     * not a token one-row drop, so it actually crosses the damage threshold.
     * Verified in-browser (RT.game.__test): destroying a pillar really does
     * bring the roof down hard enough to kill a crown underneath, not
     * assumed from the fall-height arithmetic alone (see
     * [[ballista-3d-rework]] for why a short drop doesn't reliably cross the
     * threshold, and why "shoot the base" alone never used to be enough —
     * a destroyed support's neighbours don't wake on their own). */
    /* The crown sits on a cantilevered LEDGE (one wide merged run poking one
     * cell further than the wall above and below it — `W` at col0-1 doesn't
     * merge with the `K` beside it, different materials never do, but the
     * ledge row's own col0-2 run is one single rigid body). Destroy that one
     * row and the wall above simply settles 1 unit onto the wall below (an
     * ordinary, harmless resettle) — but col2 has nothing at ANY row below
     * the ledge, all the way to the ground, so the crown genuinely free-
     * falls the full six units with nothing to catch it partway, unlike a
     * continuously-touching stack (which only ever closes by the height of
     * whatever's removed — see [[ballista-3d-rework]] for how that was
     * confirmed, and why a supported crown never has to be independently
     * reachable to begin with). Verified in-browser, not assumed. */
    { name: 'The Cantilever', par: 3, bolts: 8, dist: 29, layers: [[
      'WWK......',   // the crown, resting on nothing but the ledge below it
      'WWW......',   // the ledge — one merged run, one hit clears it entirely
      'WW.......',
      'WW.......',
      'WW.......',
      'WW.......',
      'WW.......'    // wall base, unrelated to whatever col2 is doing above
    ]] },
    /* The conservative end of the level chart — three axes, but every layer
     * still does exactly one job, and every gate is a plain copy of the same
     * cols-5-7/rows-6-7 opening, so the one proven direct sightline never
     * has to be re-verified from scratch. 13 cols wide, a 9-row twin-pillar
     * tower, and now 5 real layers of depth (deepened per Bryan's ask —
     * two new layers inserted, an indestructible steel inner gate and a
     * flanking glass screen, both keeping the SAME open gate footprint as
     * the outer wall rather than a new one, on purpose: a shot only stops
     * at the first block its trace hits (js/game.js's traceShot() has no
     * pass-through logic for any material, "shatters and carries on" from
     * this file's own header comment notwithstanding — that reveals itself
     * over separate shots, not within one), so a material with no gate at
     * all in the sightline's column would turn this into a shoot-twice
     * puzzle: break the obstruction, then hit the now-exposed crown. That is
     * a perfectly legitimate solution — a level is free to need a sequence
     * of shots (see js/game.js's header on why the reachability audit that
     * used to require single-shot solvability was removed) — but keeping
     * every new layer's gate aligned was still the simpler, more comfortable
     * *play* here, so it stayed.
     * The `B` timber board reappears as a mid-tower balcony — a second,
     * different use from The Bridge's span-over-a-pit: here it's pure
     * obstruction/flavour, bracing the two pillars with open shaft on both
     * sides of it (rows 0-2 above, rows 4-8 below), never carrying anything
     * else's weight, so it can't foul the crown-standing-flush requirement
     * the way something resting ON a board would (a board only fills
     * PLANK_FRAC of its own row's cell — flush FOR whatever sits below it,
     * since a row's floor always meets the row below's ceiling exactly, but
     * a ~0.85-cell air gap for anything placed in the row ABOVE it, which a
     * crown there would fall through and fail auditLevels' <0.05
     * settle-movement check). The crown itself sits on an ordinary flush
     * stone plinth in the BACK layer, screened by every wall's gate (cols
     * 5-7) and the tower's open shaft (cols 4-8) — all centred on the same
     * row (6) as the crown, for a clean flat sightline straight through,
     * exactly the "depth as obstruction, not a maze" rule the other
     * multi-layer levels already use. */
    { name: 'The Siege Tower', par: 3, bolts: 8, dist: 28, layers: [
      [                             // front — the wide outer wall (breadth)
        '.............',
        '.............',
        '.............',
        '.............',
        '.............',
        '.............',
        'SSSSS...SSSSS',           // gate, cols 5-7
        'SSSSS...SSSSS',
        'SSSSSSSSSSSSS'            // solid base — the gate is a window, not a door
      ], [                          // NEW — an inner steel gate, indestructible
        '.............',
        '.............',
        '.............',
        '.............',
        '.............',
        '.............',
        'XXXXX...XXXXX',           // same gate footprint as the outer wall
        'XXXXX...XXXXX',
        'XXXXXXXXXXXXX'
      ], [                          // middle — the twin-pillar tower (height)
        '...W.....W...',
        '...W.....W...',
        '...W.....W...',
        '...BBBBBBB...',           // balcony brace, open shaft both above and below
        '...W.....W...',
        '...W.....W...',
        '...W.....W...',           // row 6 — level with every gate
        '...W.....W...',
        '...W.....W...'
      ], [                          // NEW — a flanking glass screen
        '.............',
        '.............',
        '.............',
        '.............',
        '.............',
        '.............',
        'IIIII...IIIII',           // glass either side, same gate left open
        'IIIII...IIIII',
        'SSSSSSSSSSSSS'            // stone footing
      ], [                          // back — the keep, the true target (depth)
        '.............',
        '.............',
        '.............',
        '.............',
        '.............',
        '.............',
        '......K......',
        '......S......',
        '......S......'
      ]
    ] },
    /* The elaborate end of the chart — every material in MAT gets a job, two
     * crowns at two difficulty tiers, two spans, and the widest/tallest
     * footprint yet (15 cols, a 10-row tower, 4 layers). Everything below is
     * still built ONLY from patterns already proven elsewhere in this file,
     * on purpose: an early draft gave the mid-tower steel brace a gap at the
     * centre column so a shot could thread it, which meant the brace was
     * only supported at ONE end for most of its span — a real cantilever,
     * unlike The Cantilever's own (which is a solid single merged run, never
     * an asymmetric overhang) — and risks Bullet resolving it as an
     * unstable torque rather than a clean rest. Moved the two spans to rows
     * the main sightline never uses (1 and 5) instead, so both are full,
     * symmetric, both-ends-supported runs exactly like The Bridge/Siege
     * Tower's boards, and row 6 stays a plain open pillar row the whole way
     * through — the same "keep every gate on the same row/column" discipline
     * The Siege Tower's deepening above just used, not a new risk.
     *
     * Layer 0 (wall): two gates — left (cols 2-6, widened from an original
     * 2-wide cols-3-4 draft) and right (cols 10-11) — stone, with a glass
     * arrow-slit over the right gate and a plain merlon top; the glass never
     * sits in front of the centre column, so it's flavour, not a shoot-twice
     * trap. The left gate's first draft was only 2 cols wide with the crown
     * behind it sitting at the gate's own EDGE — a genuinely uncomfortable
     * shot at sweep speed (AGENTS.md's hold-to-sweep rule wants targets
     * forgiving enough to hit), which is reason enough on its own to widen
     * it. It also happened to expose a real bug worth remembering: the
     * now-removed reachability audit's coarse direct-hit grid missed that
     * narrow a window outright and fell through to a real-physics
     * simulation tier whose result depended on simulation order — passing
     * on a warm test session but failing on a genuine fresh boot. Widened to
     * 5 cols with the crown re-centred in it — better to aim at either way,
     * and (at the time) verified clean across multiple fresh boots too.
     * Layer 1 (courtyard): an EASY crown directly behind the left gate, one
     * layer to clear, no deeper obstruction — a second, shallower difficulty
     * tier the way Powder Row/Bastion escalate within one level. A powder
     * keg sits loose behind the right gate purely as a hazard/flavour (nothing
     * depends on destroying it), plus one small wood-rubble chunk on bare
     * ground — both isolated on open floor, the only placement `w`/`s`/`i`
     * chunks are safe in (see The Timberworks' lone `s` for the precedent;
     * a small chunk under a full-size block would be a narrow, likely
     * unstable support, so this file never does that).
     * Layer 2 (tower): twin pillars, TALLER than The Siege Tower's (10 rows
     * vs 9), with a timber board near the top and a steel brace lower down
     * — different material, different row, so neither merges with the
     * other or with anything in an adjacent layer.
     * Layer 3 (keep): the HARD crown, three layers deep, on a wider stone
     * altar than The Siege Tower's single-block plinth. */
    { name: 'The Grand Citadel', par: 5, bolts: 12, dist: 24, layers: [
      [                             // wall — breadth, two gates, glass slits
        '...............',
        '...............',
        '...............',
        '...............',
        '...............',
        '...............',
        'S.......SIIII.S',           // merlons + an arrow-slit over the right gate,
                                     // spanning cols 10-13 so its two end cells sit on
                                     // the gate's own jambs. At cols 11-12 (the gate's
                                     // exact width) the pane had nothing whatsoever
                                     // beneath it and dropped into the gateway on load.
        'SS.....SSS..SSS',           // gates — cols 2-6 (widened) and 10-11
        'SS.....SSS..SSS',
        'SSSSSSSSSSSSSSS'            // solid base
      ], [                          // courtyard — the easy crown, keg, rubble
        '...............',
        '...............',
        '...............',
        '...............',
        '...............',
        '...............',
        '...............',
        '....K..........',          // easy crown, centred in the widened left gate
        '....S..........',          // its pedestal
        '....S..w..T....'            // pedestal base + loose rubble + a keg
      ], [                          // tower — height, two symmetric spans
        '..W.........W..',
        '..BBBBBBBBBBB..',           // upper board, full span (both ends supported)
        '..W.........W..',
        '..W.........W..',
        '..W.........W..',
        '..XXXXXXXXXXX..',           // steel brace, full span — same discipline
        '..W.........W..',           // row 6 — level with every gate, left clear
        '..W.........W..',
        '..W.........W..',
        '..W.........W..'
      ], [                          // keep — depth, the hard crown, a wider altar
        '...............',
        '...............',
        '...............',
        '...............',
        '...............',
        '...............',
        '.....H.K.Q.....',           // hard crown, flanked by two guards on the altar
        '.....SSSSS.....',           // altar
        '.....SSSSS.....',
        'SSSSSSSSSSSSSSS'            // keep floor
      ]
    ] },
    /* The post-and-lintel level, and the one where nothing has to die from
     * being hit. Every level above this uses depth as a SCREEN — a front
     * layer hides a back one, and knocking it down only changes what can be
     * seen. This one uses depth as STRUCTURE. The middle three layers are one
     * cloister drawn identically in each, so every column layer-merges into a
     * single 1x1x3 body running front-to-back and each walk roof into one
     * 3x0.15x3 deck spanning both across the castle and into it. It is also
     * deliberately OPEN: three arches in the gatehouse, an arcade for a back
     * range, and a colonnade between them, so the eye reads straight through
     * six layers of castle rather than at a facade.
     *
     * The plan is a real cloister: gatehouse in front (layer 0), a two-layer
     * back-range arcade behind (layers 4-5), and between them a colonnade at
     * cols 0, 2, 4, 8, 10 and 12 — covered walks down each side (decks over
     * cols 0-2 and 10-12, each bridging the open column between its own two
     * posts) around an open hall at cols 4-8. Every roof is a genuine span
     * with air under it, and every span is full, symmetric and supported at
     * both ends, the discipline The Grand Citadel note above settles on.
     *
     * THE FOURTH DIMENSION IS THE WHOLE LEVEL. All three scoring targets
     * stand on a span, high, in the open, with five or six units of clear air
     * beneath them, and each is meant to be killed by taking away what it is
     * standing on rather than by being hit. The fall does the work — see
     * fallDmgMult in js/data.js, where a crown needs about 2.3 units of drop
     * to die and a guard not much more:
     *   - THE CROWN stands at row 2, col 6, on the middle of a single timber
     *     balk crossing the hall at row 3. The balk is carried on the two
     *     hall posts and nothing else, and cols 5-7 are open air for five
     *     full rows to the ground beneath him. Kill the balk (40 hp of wood,
     *     one merged body, two stone bolts or one fire bolt) and he
     *     free-falls six units with nothing whatever to catch him — around
     *     136 damage against 15 hp. Kill a hall post instead (cols 4 and 8;
     *     the gate void is cols 4-8 precisely so both posts stand in the
     *     sightline) and the balk, held at one end only, tips and sheds him.
     *   - THE TWO GUARDS stand at row 1 on the walk decks, over the open bay
     *     each deck bridges. A deck is 24 hp of board — one bolt — and when
     *     it goes the guard drops six units onto the floor of the walk.
     * All three stand clear above the gatehouse merlons AND above the back
     * range, so the three figures are the whole roofline of the castle, read
     * against open sky: big, high-contrast silhouettes rather than detail.
     *
     * And none of the three can be sniped with a flat bolt at all. That is
     * not a sightline trick — nothing blocks any of them — it is ballistics,
     * and it was measured rather than hoped for: at this castle's range a
     * direct-fire root is already well on its way down before it arrives, so
     * at row 1-2 height the flat family (stone, fire) reaches none of the
     * three figures, nor either walk deck. What a flat bolt CAN reach is the
     * gallery balk (411 aim solutions with the plain stone bolt) and both
     * hall posts, so the crown — the win condition — is winnable on the
     * starting ammunition, but only structurally: collapse something or score
     * nothing. The guards are a lob bonus. That also makes the order matter,
     * since killing the last crown ends the level (see checkWin in
     * js/game.js): collect the two guards with the lob family first, then
     * bring the balk down.
     *
     * An earlier draft stood the crown BETWEEN two posts with a beam directly
     * overhead, meaning to drop the beam on his head. Measured in-browser,
     * that never works and cannot: a beam that loses a support falls onto
     * whatever is holding its ENDS up, which is the rest of the post, so it
     * lands one row down and stops. What falls has to be what the target is
     * standing on. Every span in this castle is drawn from that.
     *
     * THE GATE is the same idea one layer forward and in plain sight: a
     * timber lintel spanning the gateway on two timber jambs, standing in a
     * screen of 90 hp stone. A 40 hp jamb is the obvious fuse, and the keg in
     * the gateway stands close enough to both jambs for its blast to be worth
     * aiming at rather than around.
     *
     * The back range is drawn TWICE, as layers 4 and 5, so it merges into a
     * two-deep arcade. As a solid single layer, 13 wide and 5 tall, it passed
     * the standing audit and then toppled forward in play the first time a
     * shot landed anywhere in the castle: one cell thick at that height is a
     * domino, and auditLevels() can only ask whether a castle stands, never
     * whether it survives being hit. Two layers deep and open is both steady
     * and lighter to look through. */
    { name: 'The Cloister', par: 4, bolts: 10, dist: 26, layers: [
      [                             // gatehouse — three arches, not a wall
        '.............',
        '.............',
        '.............',
        'S.S.......S.S',           // merlons, over the piers and nowhere else
        'SSSWWWWWWWSSS',           // stone lintels over the side arches, timber
                                   // over the gateway
        'S.SW.....WS.S',           // side arches at cols 1 and 11; gate void
        'S.SW.....WS.S',           // cols 4-8, wide enough that both hall posts
        'S.SW.....WS.S',           // stand in the sightline
        'S.SW.....WS.S'
      ], [                          // front walk — drawn the same in all three
        '.............',           // middle layers, so the colonnade merges
        '.............',           // front-to-back into one frame
        'BBB.......BBB',           // walk roofs; the hall (cols 4-8) is open sky
        'W.W.......W.W',
        'W.W.W...W.W.W',
        'W.W.W...W.W.W',
        'W.W.W...W.W.W',
        'W.W.W...W.W.W',
        'W.W.W.T.W.W.W'            // the keg, framed by the gateway arch
      ], [                          // middle walk — the whole roofline lives here
        '.............',
        '.H.........Q.',           // guards, each on a walk deck
        'BBB...K...BBB',           // the crown, on the middle of the balk
        '....WWWWW....',           // the gallery balk, layer 2 only, cols 4-8
        'W.W.W...W.W.W',           // open air under all three, to the floor
        'W.W.W...W.W.W',
        'W.W.W...W.W.W',
        'W.W.W...W.W.W',
        'W.W.W...W.W.W'
      ], [                          // back walk — the front walk again
        '.............',
        '.............',
        'BBB.......BBB',
        'W.W.......W.W',
        'W.W.W...W.W.W',
        'W.W.W...W.W.W',
        'W.W.W...W.W.W',
        'W.W.W...W.W.W',
        'W.W.W...W.W.W'
      ], [                          // back range, front half — an arcade, kept
        '.............',           // lower than the roofline so the three
        '.............',           // figures stand clear against the sky
        '.............',
        '.............',
        'SSSSSSSSSSSSS',
        'S.S.S.S.S.S.S',
        'S.S.S.S.S.S.S',
        'S.S.S.S.S.S.S',
        'S.S.S.S.S.S.S'
      ], [                          // back range, back half — identical, so the
        '.............',           // pair merges into one two-deep arcade
        '.............',
        '.............',
        '.............',
        'SSSSSSSSSSSSS',
        'S.S.S.S.S.S.S',
        'S.S.S.S.S.S.S',
        'S.S.S.S.S.S.S',
        'S.S.S.S.S.S.S'
      ]
    ] }
  ];


  // Three courtyard castles introduce timber, stone and chain reactions in real depth.
  function courtyard(name,width,depth,towerHeight,variant){
    const height=towerHeight+2;const g=Array.from({length:depth},()=>Array.from({length:height},()=>Array(width).fill('.')));
    const put=(x,y,z,ch)=>{g[z][height-1-y][x]=ch;};
    for(const x0 of [0,width-2])for(const z0 of [0,depth-2])for(let x=x0;x<x0+2;x++)for(let z=z0;z<z0+2;z++)for(let y=0;y<towerHeight;y++)put(x,y,z,'S');
    for(let z=2;z<depth-2;z++)for(let y=0;y<2;y++){put(0,y,z,'S');put(width-1,y,z,'S');}
    for(let x=2;x<width-2;x++)for(let y=0;y<2;y++)put(x,y,depth-1,'S');
    for(let y=0;y<3;y++){put(2,y,0,'W');put(width-3,y,0,'W');}
    for(let x=2;x<width-2;x++)put(x,3,0,'W');
    put(2,4,0,'Q');put(width-3,4,0,'H');
    const center=Math.floor(width/2);put(center,0,depth-3,'K');
    if(variant>0){put(1,towerHeight,depth-1,'K');put(center-1,0,depth-3,'T');put(center+1,0,depth-3,'T');}
    if(variant>1){put(width-2,towerHeight,depth-1,'K');for(let x=center-1;x<=center+1;x++)put(x,0,2,'I');}
    return{name,par:variant+2,bolts:8+variant*2,dist:24+variant,ammo:variant===0?['stone','boulder','fire']:undefined,layers:g.map(l=>l.map(r=>r.join('')))};
  }
  LEVELS.splice(0,3,courtyard('Bramblewick Gate',10,6,4,0),courtyard('Copperpot Courtyard',12,7,5,1),courtyard('Thistledown Towers',14,8,6,2));

  // Compute and cache each level's footprint once, at load — data.js's
  // castleBounds()/rangeWindow()/yawLimit() read these directly, the same
  // way they already read TEST_LEVEL's hand-set _cols/_depth.
  /** The box the blocks actually occupy: its largest side, and its middle.
   *  Height is measured from the ground rather than from the lowest block,
   *  since a castle standing on the floor is as tall as its highest point. */
  function blockBox(blocks) {
    if (!blocks.length) return { extent: CELL, centre: { x: 0, y: CELL / 2, z: 0 } };
    let x0 = Infinity, x1 = -Infinity, top = 0, z0 = Infinity, z1 = -Infinity;
    for (const b of blocks) {
      x0 = Math.min(x0, b.x - b.w / 2); x1 = Math.max(x1, b.x + b.w / 2);
      top = Math.max(top, b.y + b.h / 2);
      z0 = Math.min(z0, b.z - b.d / 2); z1 = Math.max(z1, b.z + b.d / 2);
    }
    return {
      extent: Math.max(x1 - x0, top, z1 - z0),
      centre: { x: (x0 + x1) / 2, y: top / 2, z: (z0 + z1) / 2 }
    };
  }

  // Workshop classics describe the real siege, not unimplemented quest items.
  LEVELS.forEach((level,i)=>{level.chapter=level.name;level.story='The road is blocked at '+level.name+'. Clear this stronghold to make the route safe for the villagers.';level.ending=i===LEVELS.length-1?'The strongholds are clear and the village roads are safe again.':'The stronghold is clear.';});
  for (const level of LEVELS) {
    const parsed = parseLevel(level);
    level._cols = parsed.cols;
    level._rows = parsed.rows;
    level._depth = parsed.numLayers;
    /* The castle's real occupied size and middle, from the blocks themselves
       rather than the grid they were drawn on — both for the cinematic camera
       (data.js's cinematicSeat, game.js's seatLookAt). _cols and _depth above
       are GRID dimensions and describe neither whenever a level keeps blank
       margin: The Watchtower's rows are 21 wide for a castle six cells
       across, sitting well off to one side of its own grid. Measured once
       here because a castle's authored size never changes. */
    const box = blockBox(parsed.blocks);
    level._extent = box.extent;
    level._centre = box.centre;
  }

  return {
    CELL: CELL, PLANK_FRAC: PLANK_FRAC, LEVELS: LEVELS,
    parseLevel: parseLevel, weldPairs: weldPairs, weldBreak: weldBreak, layerZ: layerZ, cellCentre: cellCentre,
    cellThickness: cellThickness, rowBottoms: rowBottoms
  };
})();
