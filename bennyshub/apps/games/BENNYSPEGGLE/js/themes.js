/**
 * Benny's P3GL — the nine worlds.
 *
 * Pure data. A theme names its backdrop (js/backdrops-*.js registers a scene
 * under the same id), its music track (js/audio.js), the board's glass and
 * rail colours, and the menu accent. Modes carry the picture grade.
 */
(function (root) {
  'use strict';

  const P3 = root.P3 = root.P3 || {};

  const THEMES = {
    /* ── Cozy: warm, slow, soothing ─────────────────────────────────────── */
    'lantern-garden': {
      mode: 'cozy', name: 'Lantern Garden', music: 'lantern-garden',
      blurb: 'A dusky garden of paper lanterns and fireflies.',
      sky: ['#2b1d3f', '#7a4a6b', '#f2a65a'], accent: '#ffb86b', accent2: '#7fd6c2',
      glass: '#1c1430', glassAlpha: 0.48, rail: '#ffcf8a', glow: '#ffd59a'
    },
    'moonlit-lake': {
      mode: 'cozy', name: 'Moonlit Lake', music: 'moonlit-lake',
      blurb: 'A calm night lake with the moon on the water.',
      sky: ['#0b1430', '#1d3462', '#6b86c4'], accent: '#cfe0ff', accent2: '#b59cff',
      glass: '#0a1228', glassAlpha: 0.44, rail: '#bcd2ff', glow: '#dfe8ff'
    },
    'snowglobe-hollow': {
      mode: 'cozy', name: 'Snowglobe Hollow', music: 'snowglobe-hollow',
      blurb: 'Soft snow falling on a cosy little village.',
      sky: ['#1a2440', '#3d5a8a', '#a9c7e8'], accent: '#ffe2a8', accent2: '#9fe3ff',
      glass: '#121a30', glassAlpha: 0.46, rail: '#fff1d0', glow: '#fff4dc'
    },

    /* ── Vivid: bright, colourful, lively ───────────────────────────────── */
    'sugar-rush': {
      mode: 'vivid', name: 'Sugar Rush', music: 'sugar-rush',
      blurb: 'Lollipop trees and gumdrop hills under a candy sky.',
      sky: ['#ff8fd0', '#ffc2e6', '#a8f0ff'], accent: '#ff4fa3', accent2: '#3fd8ff',
      glass: '#2a0f2e', glassAlpha: 0.58, rail: '#ffffff', glow: '#ffe1f3'
    },
    'carnival-skies': {
      mode: 'vivid', name: 'Carnival Skies', music: 'carnival-skies',
      blurb: 'Hot-air balloons, kites and confetti over the clouds.',
      sky: ['#2f7bff', '#7ec8ff', '#ffe08a'], accent: '#ffcc1f', accent2: '#ff5a5a',
      glass: '#0d1d3d', glassAlpha: 0.55, rail: '#fff3b0', glow: '#fff7d6'
    },
    'coral-groove': {
      mode: 'vivid', name: 'Coral Groove', music: 'coral-groove',
      blurb: 'A bright reef full of fish, bubbles and light.',
      sky: ['#003b5c', '#0a8aa8', '#55e0d0'], accent: '#ff7a59', accent2: '#3dffc8',
      glass: '#00202f', glassAlpha: 0.5, rail: '#a8fff0', glow: '#d8fff8'
    },

    /* ── Hyper: neon, space, speed ──────────────────────────────────────── */
    'neon-highway': {
      mode: 'hyper', name: 'Neon Highway', music: 'neon-highway',
      blurb: 'A synthwave road racing toward a giant sunset.',
      sky: ['#0b0221', '#3b0a5a', '#ff3d8b'], accent: '#ff3df2', accent2: '#2de2ff',
      glass: '#070118', glassAlpha: 0.42, rail: '#ff5af0', glow: '#ff9cf5'
    },
    'starlight-warp': {
      mode: 'hyper', name: 'Starlight Warp', music: 'starlight-warp',
      blurb: 'Streaking through hyperspace past glowing nebulas.',
      sky: ['#02030f', '#11124a', '#5a2fff'], accent: '#7d6bff', accent2: '#41f0ff',
      glass: '#03031a', glassAlpha: 0.44, rail: '#8fa0ff', glow: '#c9d0ff'
    },
    'quasar-core': {
      mode: 'hyper', name: 'Quasar Core', music: 'quasar-core',
      blurb: 'The edge of a black hole, ringed with fire and lasers.',
      sky: ['#050006', '#2a0418', '#ff7a1a'], accent: '#ff8a1f', accent2: '#ff2a6d',
      glass: '#080003', glassAlpha: 0.46, rail: '#ffb35c', glow: '#ffd7a8'
    }
  };
  Object.keys(THEMES).forEach(id => { THEMES[id].id = id; });

  /** The picture grade per mode (see js/post.js). */
  const GRADES = {
    cozy:  { bloom: 0.85, threshold: 1.05, vignette: 0.42, fringe: 0, exposure: 1.0, warmth: 0.7 },
    vivid: { bloom: 0.75, threshold: 1.1, vignette: 0.28, fringe: 0, exposure: 1.02, warmth: 0.15 },
    hyper: { bloom: 1.25, threshold: 0.95, vignette: 0.5, fringe: 0.6, exposure: 1.0, warmth: -0.2 }
  };

  /** Each mode's three campaign worlds, in campaign order. */
  const BY_MODE = {
    cozy: ['lantern-garden', 'moonlit-lake', 'snowglobe-hollow'],
    vivid: ['sugar-rush', 'carnival-skies', 'coral-groove'],
    hyper: ['neon-highway', 'starlight-warp', 'quasar-core']
  };

  function theme(id) { return THEMES[id] || THEMES['sugar-rush']; }

  P3.themes = { THEMES, GRADES, BY_MODE, theme };
})(typeof window !== 'undefined' ? window : globalThis);
