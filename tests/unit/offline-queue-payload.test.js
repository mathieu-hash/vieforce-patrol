// Unit tests for js/offline.js::_queuePayload — the function that strips
// queue-bookkeeping fields off a record before the offline-queue sync
// step forwards it to PostgREST (createStore / createFarm / createVisit).
//
// Regression coverage for the 2026-04-25 silent-eject bug: offline_id
// (added by queueStore/queueFarm/queueVisit for IndexedDB dedup) was
// missing from the skip set, so it travelled through to PostgREST,
// which rejected with PGRST204 "Could not find the 'offline_id' column"
// → the offline queue retried 3× and silently ejected, the user saw
// "Success" but the record never landed in stores/farms/visits.
//
// js/offline.js is browser code (depends on Dexie + window globals); we
// extract just _queuePayload via vm so we don't have to load the rest.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Extract the _queuePayload function definition from the source file.
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'offline.js'), 'utf8');
const fnMatch = src.match(/function _queuePayload[^{]*\{[\s\S]+?\n\}/);
if (!fnMatch) throw new Error('could not locate _queuePayload definition in js/offline.js');

// Wrap as an expression and evaluate in a fresh context — pure data
// transform, no browser globals required.
const _queuePayload = vm.runInThisContext(
  '(' + fnMatch[0].replace('function _queuePayload', 'function') + ')'
);

// ─────────────────────────────────────────────────────────────────────────
test('strips offline_id (PGRST204 regression)', () => {
  const out = _queuePayload({
    offline_id: 's_1745597432123_abc123',
    name: 'Golden Feeds Supply',
    store_type: 'feeds_dealer'
  });
  assert.equal('offline_id' in out, false, 'offline_id must not reach PostgREST');
  assert.equal(out.name, 'Golden Feeds Supply', 'real fields preserved');
  assert.equal(out.store_type, 'feeds_dealer');
});

test('strips every known queue bookkeeping field', () => {
  const out = _queuePayload({
    id: 42,
    offline_id: 's_x',
    created_at: '2026-04-25T01:00:00Z',
    retry_count: 2,
    last_error: 'PGRST204: ...',
    last_attempt_at: '2026-04-25T01:00:30Z',
    name: 'real field — keep'
  });
  assert.deepEqual(Object.keys(out), ['name'], 'only the non-bookkeeping field survives');
  assert.equal(out.name, 'real field — keep');
});

test('extraSkip parameter widens the strip list', () => {
  const out = _queuePayload(
    { name: 'X', photo_base64: 'iVBORw...', store_type: 'farm' },
    { photo_base64: 1 }
  );
  assert.equal('photo_base64' in out, false);
  assert.equal(out.name, 'X');
  assert.equal(out.store_type, 'farm');
});

test('preserves all real DB columns through the strip', () => {
  // Mirror the chatbot's typical store payload — every key must survive
  // EXCEPT offline_id and created_at (queue bookkeeping).
  const chatbotPayload = {
    name: 'Test Store',
    owner_name: 'Mat',
    phone: '09171234567',
    store_type: 'feeds_dealer',
    lat: 14.6, lng: 121.0,
    city: 'Quezon City',
    photo_url: null,
    vol_class: 'A',
    health_status: 'ok',
    store_status: 'prospect',
    prospect_stage: 'identified',
    bags_per_month: 100,
    created_by: 'de9cf11e-1153-4b59-bc7a-7a22e282e190',
    // queue bookkeeping (added by queueStore at runtime)
    offline_id: 's_1745597432123_abc',
    created_at: '2026-04-25T01:00:00Z'
  };
  const out = _queuePayload(chatbotPayload);

  // Bookkeeping stripped
  assert.equal('offline_id' in out, false);
  assert.equal('created_at' in out, false);

  // 14 real fields preserved
  for (const k of [
    'name','owner_name','phone','store_type','lat','lng','city','photo_url',
    'vol_class','health_status','store_status','prospect_stage','bags_per_month',
    'created_by'
  ]) {
    assert.equal(k in out, true, `${k} must survive _queuePayload strip`);
  }
  assert.equal(Object.keys(out).length, 14);
});
