const { test } = require('node:test');
const assert = require('node:assert/strict');
const { create, normalize } = require('../bennyshub/shared/hub-library.js');

function fixture(initial = {}) {
  let saved = initial;
  const platform = { settings: { open(options) {
    let state = options.normalize(saved);
    return {
      readCached: () => state,
      reload: () => (state = options.normalize(saved)),
      save: value => (saved = state = options.normalize(value))
    };
  } } };
  return { library: create(platform), restore: () => create(platform), read: () => saved };
}
const alpha = { id: 'alpha', title: 'Alpha' };
const beta = { id: 'beta', title: 'Beta' };
const zeta = { id: 'zeta', title: 'Zeta' };
const ids = items => items.map(app => app.id);

test('recently used ranks last opening before pagination, leaving unopened items alphabetic', () => {
  const { library } = fixture();
  const items = [zeta, beta, alpha];
  library.recordOpen('games', zeta, 100);
  library.recordOpen('games', beta, 200);
  assert.deepEqual(ids(library.order(items, 'games', 'recent')), ['beta', 'zeta', 'alpha']);
  assert.deepEqual(ids(items), ['zeta', 'beta', 'alpha'], 'sorting does not mutate the catalog');
});

test('most played counts opens and uses recency then title for ties', () => {
  const { library } = fixture();
  library.recordOpen('games', zeta, 100);
  library.recordOpen('games', zeta, 200);
  library.recordOpen('games', beta, 300);
  assert.deepEqual(ids(library.order([alpha, beta, zeta], 'games', 'most-used')), ['zeta', 'beta', 'alpha']);
  library.recordOpen('games', beta, 400);
  assert.deepEqual(ids(library.order([zeta, beta, alpha], 'games', 'most-used')), ['beta', 'zeta', 'alpha']);
});

test('sort choices and launch history survive a reload independently for tools and games', () => {
  const f = fixture();
  f.library.setSort('games', 'recent');
  f.library.setSort('tools', 'most-used');
  f.library.recordOpen('games', zeta, 100);
  const restored = f.restore();
  assert.equal(restored.getSort('games'), 'recent');
  assert.equal(restored.getSort('tools'), 'most-used');
  assert.deepEqual(ids(restored.order([alpha, zeta], 'games')), ['zeta', 'alpha']);
  assert.deepEqual(ids(restored.order([alpha, zeta], 'tools')), ['alpha', 'zeta']);
});

test('alphabetical reset keeps personal history available for the next sort choice', () => {
  const f = fixture();
  f.library.recordOpen('games', zeta, 100);
  f.library.setSort('games', 'recent');
  f.library.setSort('games', 'alphabetical');
  assert.deepEqual(ids(f.library.order([zeta, alpha], 'games')), ['alpha', 'zeta']);
  f.library.setSort('games', 'recent');
  assert.deepEqual(ids(f.library.order([zeta, alpha], 'games')), ['zeta', 'alpha']);
});

test('malformed storage values are sanitized, and new users have a stable alphabetical list', () => {
  assert.deepEqual(normalize(null), { sorts: { games: 'alphabetical', tools: 'alphabetical' }, usage: {} });
  const f = fixture({ sorts: { games: 'bogus' }, usage: {
    'games:zeta': { count: -3, lastUsed: 'invalid' },
    'tools:beta': { count: Infinity, lastUsed: -100 },
    'unknown:zeta': { count: 100, lastUsed: 100 }
  } });
  assert.equal(f.library.getSort('games'), 'alphabetical');
  for (const sort of ['alphabetical', 'recent', 'most-used']) {
    assert.deepEqual(ids(f.library.order([zeta, beta, alpha], 'games', sort)), ['alpha', 'beta', 'zeta']);
  }
});

test('updates merge stored history from another window and avoid invalid catalog identities', () => {
  const f = fixture();
  const second = f.restore();
  f.library.recordOpen('games', alpha, 100);
  second.recordOpen('games', beta, 200);
  f.library.recordOpen('games', alpha, 300);
  f.library.recordOpen('elsewhere', zeta);
  f.library.recordOpen('games', { id: '__bad:id' });
  f.library.recordOpen('games', null);
  assert.deepEqual(Object.keys(f.read().usage).sort(), ['games:alpha', 'games:beta']);
  assert.equal(f.read().usage['games:alpha'].count, 2);
  assert.equal(f.read().usage['games:beta'].count, 1);
});
