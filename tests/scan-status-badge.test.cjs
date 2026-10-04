const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function fixture() {
  function element(text = '') {
    const attributes = new Map(), children = [];
    return { nodeType: 1, textContent: text, attributes, children, classes: [], scrolls: [],
      setAttribute(name, value) { attributes.set(name, value); },
      removeAttribute(name) { attributes.delete(name); },
      classList: { add() {} }, appendChild(child) { children.push(child); },
      scrollIntoView(options) { this.scrolls.push(options); }, remove() { this.removed = true; } };
  }
  const context = vm.createContext({ document: { createElement: () => element() } });
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../bennyshub/shared/scan-status-badge.js'), 'utf8'), context);
  const host = element(), badge = context.NarbeScanStatusBadge.create({ host });
  return { element, host, badge, node: host.children[0] };
}

test('paused feedback marks only the selected outline, adds no text and cleans up on every transition', () => {
  const { element, badge, node } = fixture();
  const item = element('Volume'), label = element('Volume'), next = element('Next');
  badge.update('Paused', { item, label, state: { braked: true } });
  assert.equal(item.attributes.has('data-narbe-scan-paused'), true);
  assert.equal(label.attributes.has('data-narbe-scan-pause-label'), false);
  assert.equal(item.textContent, 'Volume'); assert.equal(label.textContent, 'Volume');
  assert.equal(node.textContent, ''); assert.equal(node.hidden, true);
  badge.update('Paused', { item: next });
  assert.equal(item.attributes.has('data-narbe-scan-paused'), false);
  assert.equal(label.attributes.has('data-narbe-scan-pause-label'), false);
  assert.equal(next.attributes.has('data-narbe-scan-paused'), true);
  assert.equal(next.attributes.has('data-narbe-scan-pause-label'), false);
  badge.update('', { item: next });
  assert.equal(next.attributes.has('data-narbe-scan-paused'), false);
  assert.equal(next.attributes.has('data-narbe-scan-pause-label'), false); assert.equal(node.hidden, true);
  badge.update('Paused', { item: { id: 'not-a-dom-node' } });
  badge.update('Paused', { item, label }); badge.destroy();
  assert.equal(item.attributes.has('data-narbe-scan-paused'), false);
  assert.equal(label.attributes.has('data-narbe-scan-pause-label'), false); assert.equal(node.removed, true);
});

test('only active persistent parking reveals the existing status host, once per transition', () => {
  const { element, host, badge, node } = fixture(); const item = element();
  badge.update('', { state: { index: -1 } });
  badge.update('Paused', { item, state: { index: 0, braked: true } });
  assert.equal(host.scrolls.length, 0);
  badge.update('Parked', { state: { index: -1, parked: true, suspended: true } });
  assert.equal(host.scrolls.length, 0); assert.equal(item.attributes.has('data-narbe-scan-paused'), false);
  badge.update('Parked', { state: { index: -1, parked: true, suspended: false } });
  assert.equal(host.scrolls.length, 1); assert.equal(node.textContent, 'Parked');
  assert.equal(host.scrolls[0].block, 'nearest'); assert.equal(host.scrolls[0].inline, 'nearest');
  badge.update('Parked', { state: { parked: true, suspended: false } });
  assert.equal(host.scrolls.length, 1, 'redraws do not repeatedly scroll the page');
  badge.update('', { state: { index: -1 } }); badge.update('Parked', { state: { parked: true } });
  assert.equal(host.scrolls.length, 2, 'a fresh parking transition may reveal the same host again');
});
