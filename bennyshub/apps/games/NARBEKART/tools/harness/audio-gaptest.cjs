/** Experiment: does <audio loop> wrap a blob WAV without a gap in Electron? */
module.exports = async function (t) {
  await t.load('apps/games/NARBEKART/tools/audio_gaptest.html');
  await t.until('window.__gap', 120000);
  const r = await t.js('window.__gap');
  t.note(JSON.stringify(r, null, 1));
  t.assert(true, 'measured');
};
