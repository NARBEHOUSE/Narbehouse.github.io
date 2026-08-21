/**
 * Benny's FishMaster — procedural lake layout.
 *
 * The boat never moves and always sits at fixed bottom-center, so a lake only
 * ever needs to exist as a forward-facing fan, not a closed shape. A lake is
 * SECTOR_COUNT pie slices spanning a fixed forward arc; each slice has a
 * radius wobble (a hand-rolled, seeded fake-Perlin — a few sine waves, no
 * noise library) so no two lakes look identical, and a near/mid/far/deep band
 * of biome ids taken from that lake template's biomeIds list.
 *
 * Everything here is a pure function of (lakeTemplate, seed): regenerating a
 * lake from its stored seed always reproduces the same layout, so nothing
 * about the geometry itself needs to be saved to localStorage — only the seed.
 */
window.FishMasterLakeGen = (function () {
  'use strict';

  const SECTOR_COUNT = 5;
  const ARC_DEG = 140; // total forward arc, centred on straight-ahead (0deg)
  const BANDS = ['near', 'mid', 'far', 'deep'];
  const BAND_LABEL = { near: 'Near', mid: 'Mid-range', far: 'Far', deep: 'Deep water' };

  // Where each band ENDS, as a fraction of the fishable water in that
  // direction. With art.js loaded that is the painted shoreline inset by
  // WATER_INSET (art.js's waterRadius), not a bare CFG.LAKE_MAX_R circle, so
  // the bands follow the organic bank instead of cutting arcs across it. Rod
  // reach (data.js `reachFrac`) is measured against the same water, so these
  // numbers and the rod numbers have to be read together — see the reach table
  // in data.js's RODS comment.
  const BAND_FRAC = { near: 0.28, mid: 0.52, far: 0.78, deep: 1.0 };

  // How much a sector's outer edge may differ from the average. Kept tight on
  // purpose: rod reach is compared against band edges that this scales, so a
  // wilder wobble would smear the "which rod reaches which water" table in
  // data.js into something no player could predict.
  const RADIUS_MUL_MIN = 0.85;
  const RADIUS_MUL_MAX = 1.15;

  // Deterministic PRNG (mulberry32) — same seed always produces the same
  // sequence, which is what lets a lake's layout survive a page reload.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function bearingLabel(bearing) {
    if (bearing <= -50) return 'Far Left';
    if (bearing <= -15) return 'Left';
    if (bearing < 15) return 'Straight Ahead';
    if (bearing < 50) return 'Right';
    return 'Far Right';
  }

  /* A lake template names four biomes in depth order. Anything shorter is
     padded by cycling, so a half-authored template still generates rather than
     throwing — the objective feasibility filter in game.js is what decides
     whether the result is playable, not this function. */
  function fourBiomes(biomeIds) {
    const out = [];
    for (let i = 0; i < 4; i++) out.push(biomeIds[i % biomeIds.length]);
    return out;
  }

  /**
   * Builds SECTOR_COUNT sectors across the forward arc. Each sector gets:
   *  - bearing: degrees from straight ahead, negative = left
   *  - radiusMul: RADIUS_MUL_MIN-MAX, a seeded wobble so lake shape varies
   *  - biomesByBand: { near, mid, far, deep } -> biome id.
   *
   * The template's four biomes are read as two pairs — [near/mid] and
   * [far/deep] — and each pair is flipped or not per sector on a seeded coin
   * toss. Depth order is never broken (a deep-water biome never turns up in
   * the near band), so "cast further" always means "fish deeper" and a rod
   * upgrade always opens water that really was unreachable. What direction
   * buys you is which of the pair sits closer: cast left and the weeds may be
   * right off the boat, cast right and you have to throw past the shallows to
   * find them.
   */
  function generateLake(lakeTemplate, seed) {
    const rand = mulberry32(seed);
    const biomeIds = fourBiomes(lakeTemplate.biomeIds);
    const step = ARC_DEG / (SECTOR_COUNT - 1);
    const sectors = [];

    for (let i = 0; i < SECTOR_COUNT; i++) {
      const bearing = -ARC_DEG / 2 + step * i;
      // Two seeded sine waves stand in for real Perlin noise — cheap, smooth,
      // and reproducible from the same seed without vendoring a library.
      const noise = 0.09 * Math.sin(seed * 0.13 + i * 1.7) + 0.06 * Math.sin(seed * 0.31 + i * 3.1);
      const radiusMul = Math.max(RADIUS_MUL_MIN, Math.min(RADIUS_MUL_MAX, 1 + noise));

      const flipShallow = rand() < 0.5;
      const flipDeep = rand() < 0.5;
      const biomesByBand = {
        near: biomeIds[flipShallow ? 1 : 0],
        mid:  biomeIds[flipShallow ? 0 : 1],
        far:  biomeIds[flipDeep ? 3 : 2],
        deep: biomeIds[flipDeep ? 2 : 3]
      };

      sectors.push({ index: i, bearing, bearingLabel: bearingLabel(bearing), radiusMul, biomesByBand });
    }

    return { lakeId: lakeTemplate.id, seed, sectors };
  }

  function biomeAt(lake, sectorIndex, band) {
    const s = lake.sectors[sectorIndex];
    return s ? s.biomesByBand[band] : null;
  }

  /* The band a cast lands in, given how far it went as a fraction of
     CFG.LAKE_MAX_R. Band edges scale with the sector's own radiusMul, which is
     why the same distance is "far water" in a short direction and only
     "mid-range" in a long one. */
  function bandForFrac(frac, radiusMul) {
    for (const band of BANDS) {
      if (frac <= BAND_FRAC[band] * radiusMul + 1e-9) return band;
    }
    return BANDS[BANDS.length - 1];
  }

  /* Which bands a given reach can actually put a lure into, for this sector.
     A band is in reach once you can get past the end of the one before it. */
  function reachableBands(reachFrac, radiusMul) {
    const out = [];
    let prevEdge = 0;
    for (const band of BANDS) {
      if (reachFrac > prevEdge + 1e-9) out.push(band);
      prevEdge = BAND_FRAC[band] * radiusMul;
    }
    return out.length ? out : [BANDS[0]];
  }

  /**
   * radiusMul sampled at an arbitrary bearing rather than only at the five
   * sector centres — art.js walks the shoreline in one-degree steps and needs
   * a value everywhere in between. Cosine interpolation (not linear) so the
   * bank curves through each sector instead of showing a crease at every
   * sector boundary; outside the fan it clamps to the end sectors.
   */
  function radiusMulAt(lake, bearing) {
    const sectors = lake.sectors;
    const step = ARC_DEG / (sectors.length - 1);
    const first = sectors[0].bearing;
    const t = (bearing - first) / step;
    if (t <= 0) return sectors[0].radiusMul;
    if (t >= sectors.length - 1) return sectors[sectors.length - 1].radiusMul;
    const i = Math.floor(t);
    const f = t - i;
    const smooth = (1 - Math.cos(f * Math.PI)) / 2;
    return sectors[i].radiusMul * (1 - smooth) + sectors[i + 1].radiusMul * smooth;
  }

  return {
    generateLake, biomeAt, bandForFrac, reachableBands, radiusMulAt,
    // mulberry32 is exported so art.js can seed its own decoration (boulder
    // placement, lily pads) off the same lake seed — one PRNG, one source of
    // determinism, so a lake's art reloads identical to its layout.
    mulberry32,
    BANDS, BAND_LABEL, BAND_FRAC, ARC_DEG, SECTOR_COUNT
  };
})();
