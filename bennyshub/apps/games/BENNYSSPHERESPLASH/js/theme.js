/** Benny's Sphere Splash - colour profiles: Standard and High Contrast (Fish Mystery's way).
 *
 *  body[data-theme] picks a block of CSS tokens in css/ss.css. The cards and HUD use them
 *  directly; the 3D world reads the --w-* ones through palette() (cached until the theme
 *  changes) and repaints itself in onChange(). So one place, ss.css, holds every colour of
 *  both profiles, the water and the swimmers' outlines included. */
SS.theme = (function () {
  'use strict';

  // What the world reads: palette key -> CSS token. Numbers are parsed; colours stay CSS strings.
  const VARS = {
    sky: '--w-sky', fog: '--w-fog', fogDensity: '--w-fog-density',
    top: '--w-water-top', mid: '--w-water-mid', deep: '--w-water-deep', haze: '--w-haze', surface: '--w-surface',
    glass: '--w-glass', rim: '--w-rim', stadium: '--w-stadium', crowd: '--w-crowd',
    outline: '--w-outline', outlineAdd: '--w-outline-add',
    goalInk: '--w-goal-ink', net: '--w-net', trail: '--w-trail', trailCore: '--w-trail-core', ball: '--w-ball', lane: '--w-lane',
  };
  const NUMBERS = { fogDensity: 1, haze: 1, surface: 1, stadium: 1, crowd: 1, outlineAdd: 1, net: 1 };
  let cache = null;
  const subs = [];

  function palette() {
    if (cache) return cache;
    const cs = getComputedStyle(document.body);
    cache = {};
    Object.keys(VARS).forEach(k => {
      const v = cs.getPropertyValue(VARS[k]).trim();
      cache[k] = NUMBERS[k] ? parseFloat(v) || 0 : (v || '#888');
    });
    return cache;
  }
  function changed() { cache = null; const p = palette(); subs.forEach(f => { try { f(p); } catch (e) { console.error('theme:', e); } }); }
  /** Apply the saved profile (Settings > Colour Profile). */
  function apply() {
    const id = SS.save.settings.get('theme') === 'contrast' ? 'contrast' : 'standard';
    if (document.body.dataset.theme === id && cache) return;
    document.body.dataset.theme = id;
    changed();
  }
  /** Repaint hooks: fn(palette) now and on every change. */
  function onChange(fn) { subs.push(fn); if (document.body.dataset.theme) fn(palette()); }
  /** Picture rounds only: override tokens inline ({ '--w-water-mid': '#000' }), null clears them all. */
  function preview(vars) {
    const st = document.body.style;
    if (vars === null) { for (let i = st.length - 1; i >= 0; i--) if (st[i].startsWith('--')) st.removeProperty(st[i]); }
    else Object.keys(vars).forEach(k => st.setProperty(k, vars[k]));
    changed();
  }
  const isContrast = () => document.body.dataset.theme === 'contrast';

  return { palette, apply, onChange, preview, isContrast };
})();
