const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeStoresChipLabel,
  storesNavPrefToFilter
} = require('../../js/stores-nav-pref.js');

test('normalizeStoresChipLabel accepts chips and lowercases', () => {
  assert.equal(normalizeStoresChipLabel('WARN'), 'warn');
  assert.equal(normalizeStoresChipLabel('Prospect'), 'prospect');
  assert.equal(normalizeStoresChipLabel('all'), 'all');
});

test('normalizeStoresChipLabel rejects unknown → all', () => {
  assert.equal(normalizeStoresChipLabel('typo'), 'all');
  assert.equal(normalizeStoresChipLabel(''), 'all');
  assert.equal(normalizeStoresChipLabel(null), 'all');
});

test('storesNavPrefToFilter all + search', () => {
  assert.deepEqual(storesNavPrefToFilter('all', ''), {});
  assert.deepEqual(storesNavPrefToFilter('all', '  cebu '), { search: 'cebu' });
});

test('storesNavPrefToFilter health + store_status', () => {
  assert.deepEqual(storesNavPrefToFilter('warn', ''), { health_status: 'warn' });
  assert.deepEqual(storesNavPrefToFilter('crit', ''), { health_status: 'crit' });
  assert.deepEqual(storesNavPrefToFilter('prospect', ''), { store_status: 'prospect' });
  assert.deepEqual(storesNavPrefToFilter('active', ''), { store_status: 'active' });
});

test('storesNavPrefToFilter unknown label → all mapping', () => {
  assert.deepEqual(storesNavPrefToFilter('garbage', 'x'), { search: 'x' });
});
