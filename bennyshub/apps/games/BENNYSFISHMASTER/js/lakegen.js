/**
 * Benny's FishMaster — procedural lake layout.
 *
 * The boat never moves and always sits at fixed bottom-center, so a lake only
 * ever needs to exist as a forward-facing fan, not a closed shape. A lake is
 * SECTOR_COUNT pie slices spanning a fixed forward arc; each slice has a
 * radius wobble (a hand-rolled, seeded fake-Perlin — a few sine waves, no
 * noise library) so no two lakes look identical, and a near/mid/far band of
 * biome ids drawn from that lake template's biomeIds list.
 *
 * Everything here is a pure function of (lakeTemplate, seed): regenerating a
 * lake from its stored seed always reproduces the same layout, so nothing
 * about the geometry itself needs to be saved to localStorage — only the seed.
 */
window.FishMasterLakeGen = (function () {
  'use strict';

  const SECTOR_COUNT = 5;
  const ARC_DEG = 140; // total forward arc, centred on straight-ahead (0deg)
  const BANDS = ['near', 'mid', 'far'];
  const BAND_LABEL = { near: 'Near', mid: 'Mid-range', far: 'Far' };

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

  /**
   * Builds SECTOR_COUNT sectors across the forward arc. Each sector gets:
   *  - bearing: degrees from straight ahead, negative = left
   *  - radiusMul: 0.7-1.3, a seeded wobble so lake shape varies per seed
   *  - biomesByBand: { near, mid, far } -> biome id, cyclically assigned from
   *    the lake template's biomeIds with a seeded jitter so bands don't line
   *    up identically across every sector.
   */
  function generateLake(lakeTemplate, seed) {
    const rand = mulberry32(seed);
    const biomeIds = lakeTemplate.biomeIds;
    const n = biomeIds.length;
    const step = ARC_DEG / (SECTOR_COUNT - 1);
    const sectors = [];

    for (let i = 0; i < SECTOR_COUNT; i++) {
      const bearing = -ARC_DEG / 2 + step * i;
      // Two seeded sine waves stand in for real Perlin noise — cheap, smooth,
      // and reproducible from the same seed without vendoring a library.
      const noise = 0.15 * Math.sin(seed * 0.13 + i * 1.7) + 0.10 * Math.sin(seed * 0.31 + i * 3.1);
      const radiusMul = Math.max(0.7, Math.min(1.3, 1 + noise));

      const offset = i % n;
      const jitter = Math.floor(rand() * n);
      const biomesByBand = {
        near: biomeIds[offset % n],
        mid:  biomeIds[(offset + 1 + (jitter % Math.max(1, n - 1))) % n],
        far:  biomeIds[(offset + 2) % n]
      };

      sectors.push({ index: i, bearing, bearingLabel: bearingLabel(bearing), radiusMul, biomesByBand });
    }

    return { lakeId: lakeTemplate.id, seed, sectors };
  }

  function biomeAt(lake, sectorIndex, band) {
    const s = lake.sectors[sectorIndex];
    return s ? s.biomesByBand[band] : null;
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

  // mulberry32 is exported so art.js can seed its own decoration (boulder
  // placement, lily pads) off the same lake seed — one PRNG, one source of
  // determinism, so a lake's art reloads identical to its layout.
  return { generateLake, biomeAt, radiusMulAt, mulberry32, BANDS, BAND_LABEL, ARC_DEG, SECTOR_COUNT };
})();
