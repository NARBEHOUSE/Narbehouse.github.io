// Real-browser authoring checks, with the same game/physics used by Test Play.
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.resolve(__dirname, '../../../../../../node_modules/playwright'));
const { start } = require('../serve.cjs');
const P = require('./load.cjs');
require('../../js/editor/model.js');
const E = P.editorTools;

for (const type of ['line', 'arc', 'grid', 'spiral', 'circle', 'heart', 'star']) {
  const pattern = E.symmetry(E.pattern({ type, x: 500, y: 560, count: 12, rows: 3, width: 400, height: 260 }, { t: 'peg', r: 17, c: 'blue' }), 'none');
  assert.equal(pattern.length, type === 'grid' ? 36 : 12, type + ' count');
  assert(pattern.every(p => p.x >= 41 && p.x <= 959 && p.y >= 167 && p.y <= 968), type + ' safe');
}
assert.equal(E.symmetry([{ t: 'peg', x: 500, y: 500, r: 17, c: 'blue' }], 'x').length, 1, 'symmetry deduplicates the axis');
const mirrored = E.symmetry([{ t: 'peg', x: 300, y: 400, r: 17, m: { type: 'rotate', cx: 400, cy: 400, speed: 30 } }], 'x');
assert.equal(mirrored[1].m.cx, 600); assert.equal(mirrored[1].m.speed, -30);
assert(E.problems(P.levels.normLevel({ items: [{ t: 'portal', x: 500, y: 400 }] }, 'vivid', 0), 'vivid').some(s => /exactly two/.test(s)));
console.log('PASS editor pattern generation, symmetry and validation');

(async () => {
  const server = await start(0);
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', dialog => dialog.accept());
    await page.goto(`http://127.0.0.1:${server.port}/apps/games/BENNYSPEGGLE/editor.html`);
    await page.waitForFunction(() => window.P3 && P3.editor);
    assert.equal(await page.evaluate(() => P3.editor.campaign.levels[0].items.length), 28);
    assert.equal(await page.locator('#palette button').count(), Object.keys(P.catalog.TYPES).length);
    await page.locator('#campaign-title').fill('Editor QA Campaign'); await page.locator('#campaign-title').press('Tab');
    await page.locator('#clear-level').click();
    assert.equal(await page.evaluate(() => P3.editor.campaign.levels[0].items.length), 0);
    await page.getByText('Patterns and symmetry', { exact: true }).click();
    await page.locator('#pattern').selectOption('grid'); await page.locator('#pattern-count').fill('3'); await page.locator('#pattern-rows').fill('2');
    await page.locator('#pattern-width').fill('300'); await page.locator('#pattern-height').fill('180'); await page.locator('#add-pattern').click();
    assert.equal(await page.evaluate(() => P3.editor.campaign.levels[0].items.length), 6);
    await page.locator('#undo').click(); assert.equal(await page.evaluate(() => P3.editor.campaign.levels[0].items.length), 0);
    await page.locator('#redo').click(); assert.equal(await page.evaluate(() => P3.editor.campaign.levels[0].items.length), 6);
    await page.locator('#pattern-count').fill('40'); await page.locator('#pattern-rows').fill('20'); await page.locator('#add-pattern').click();
    assert.equal(await page.evaluate(() => P3.editor.campaign.levels[0].items.length), 6, 'oversized patterns are atomic');
    assert(/320-piece limit/.test(await page.locator('#status').innerText()));
    await page.locator('#item-list').selectOption('0'); await page.locator('#board').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => P3.editor.campaign.levels[0].items[0].x), 351, 'keyboard nudges the selected piece');
    await page.locator('#undo').click(); await page.locator('#select-all').click();
    await page.locator('#motion-type').selectOption('slide');
    assert(await page.evaluate(() => P3.editor.campaign.levels[0].items.every(p => p.m.type === 'slide')));
    await page.locator('#preview-motion').click(); await page.waitForTimeout(180);
    assert(await page.evaluate(() => P3.editor.previewTime > 0)); await page.locator('#preview-motion').click();
    await page.locator('#motion-type').selectOption('none');
    await page.locator('#item-list').selectOption('0'); await page.locator('#item-type').selectOption('portal');
    assert(/exactly two/.test(await page.locator('#problems').innerText()));
    await page.locator('#undo').click();
    await page.locator('#duplicate-level').click(); assert.equal(await page.evaluate(() => P3.editor.campaign.levels.length), 2);
    await page.locator('#level-up').click(); assert.equal(await page.evaluate(() => P3.editor.levelIndex), 0);
    await page.locator('#save').click();
    assert.equal(await page.evaluate(() => P3.levels.library().length), 1);
    const savedId = await page.evaluate(() => P3.editor.campaign.id);
    await page.reload(); await page.waitForFunction(() => P3.editor);
    assert.equal(await page.locator('#campaign-title').inputValue(), 'Editor QA Campaign');
    assert.equal(await page.evaluate(() => P3.editor.campaign.levels.length), 2);
    await page.locator('#open-library').click(); await page.getByRole('button', { name: 'Open Editor QA Campaign', exact: true }).click();
    assert.equal(await page.evaluate(() => P3.editor.campaign.id), savedId);

    const downloadPromise = page.waitForEvent('download'); await page.locator('#export').click(); const download = await downloadPromise;
    const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(exported.format, P.levels.FORMAT); assert.equal(exported.levels.length, 2);
    assert.equal(exported.levels[0].items.length, 6);
    console.log('PASS editor controls, motion, undo/redo, library, draft persistence and v3 export');

    const legacy = { meta: { format: 'bennys-peggle-levels-v1', title: 'Old board' }, levels: [{ id: 1, pegs: [{ x: 410, y: 250, radius: 18, type: 'NORMAL' }] }] };
    await page.locator('#import-file').setInputFiles({ name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) });
    await page.waitForFunction(() => P3.editor.campaign.title === 'Old board');
    assert.equal(await page.evaluate(() => P3.editor.campaign.levels[0].items[0].t), 'peg');
    assert.equal(await page.locator('#campaign-theme').inputValue(), 'sugar-rush', 'legacy world resolves to a current world');
    await page.locator('#import-file').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('not json') });
    assert.equal(await page.evaluate(() => P3.editor.campaign.title), 'Old board');
    assert(/not valid JSON/.test(await page.locator('#status').innerText()));

    const simple = P.levels.normCampaign({ id: 'custom-editor-test', title: 'Test fixture', mode: 'vivid', theme: 'sugar-rush', levels: [{ name: 'One peg', goal: { type: 'clear' }, balls: 5, items: [{ t: 'peg', x: 500, y: 400, r: 20, c: 'orange' }] }] });
    await page.locator('#import-file').setInputFiles({ name: 'test.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(simple)) });
    await page.waitForFunction(() => P3.editor.campaign.title === 'Test fixture');
    await page.locator('#estimate').click(); await page.waitForFunction(() => !document.getElementById('estimate').disabled, null, { timeout: 60000 });
    assert(/Expert:/.test(await page.locator('#estimate-result').innerText()));
    await page.locator('#apply-stars').click();
    assert(await page.evaluate(() => P3.editor.campaign.levels[0].stars[1] > P3.editor.campaign.levels[0].stars[0]));
    await page.locator('#test').click();
    const frame = await page.locator('#test-frame').contentFrame();
    await frame.locator('#banner').waitFor({ state: 'visible', timeout: 30000 });
    assert(await frame.locator('body').evaluate(() => P3.game.test && P3.game.campaign.id === 'custom-editor-test'));
    await page.locator('#close-test').click(); assert.equal(await page.locator('#test-dialog').evaluate(el => el.open), false);
    console.log('PASS legacy import, invalid JSON recovery, worker estimate and game test-play integration');
    const out = path.resolve(__dirname, '../../../../../../tmp/p3gl-tests'); fs.mkdirSync(out, { recursive: true });
    await page.screenshot({ path: path.join(out, 'editor-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(out, 'editor-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []); console.log('PASS no browser errors; responsive editor has no horizontal overflow');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
