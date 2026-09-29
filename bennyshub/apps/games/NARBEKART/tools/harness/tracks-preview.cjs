/**
 * Top-down plans of every circuit (tools/track_preview.html), one screenshot
 * each plus the eight-up overview, and the same verdict tools/validate_tracks.js
 * prints. Dev-only.
 *
 * Environment (optional):
 *   NK_TRACKS=meadow,shores   only these circuits (default: all eight + overview)
 *   NK_DEV=1                  draw the authoring corner circles and bend labels
 *   NK_MIRROR=1               also shoot each circuit's Mirror-mode layout
 */
module.exports = async function (t) {
  const PAGE = 'apps/games/NARBEKART/tools/track_preview.html';
  const all = ['meadow', 'shores', 'candy', 'dunes', 'frost', 'spooky', 'lava', 'starlight'];
  const only = (process.env.NK_TRACKS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ids = only.length ? only : all;
  const dev = process.env.NK_DEV === '1';

  if (!only.length) {
    await t.load(PAGE, { overview: 1 });
    await t.until('window.__preview');
    const ov = await t.js('window.__preview');
    await t.shot('00-overview');
    t.assert(!ov.error, 'overview drew', ov.error);
    (ov.overview || []).forEach((v) => t.assert(v.ok, 'overview verdict ' + v.id, v.issues));
  }

  const runs = [];
  ids.forEach((id, i) => {
    runs.push({ id: id, mirror: false, n: i + 1 });
    if (process.env.NK_MIRROR === '1') runs.push({ id: id, mirror: true, n: i + 1 });
  });
  for (const r of runs) {
    const q = { track: r.id };
    if (dev) q.dev = 1;
    if (r.mirror) q.mirror = 1;
    await t.load(PAGE, q);
    await t.until('window.__preview');
    const p = await t.js('window.__preview');
    await t.shot(String(r.n).padStart(2, '0') + '-' + r.id + (r.mirror ? '-mirror' : ''));
    if (p.error) { t.assert(false, r.id + ' drew', p.error); continue; }
    const s = p.stats;
    t.note(r.id + (r.mirror ? ' (mirror)' : '') + ': L=' + s.L.toFixed(0) + ' minR=' + s.minRadius.toFixed(0) +
      ' slope=' + (s.maxSlope * 100).toFixed(1) + '% y=' + s.yMin.toFixed(1) + '..' + s.yMax.toFixed(1) +
      ' drifts=' + s.drifts.map((d) => d.dir + d.r.toFixed(0)).join(' ') + ' straight=' + s.longestStraight.toFixed(0) +
      ' drop=' + s.dropMetres.toFixed(0) + ' wall=' + s.wallMetres.toFixed(0) + ' counts=' + JSON.stringify(s.counts));
    t.assert(p.ok, r.id + (r.mirror ? ' mirror' : '') + ' passes every rule', p.issues);
    (p.warnings || []).forEach((w) => t.note('  note: ' + w));
  }
};
