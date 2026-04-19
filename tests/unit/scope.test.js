// Unit tests for api/_lib/scope.js — Phase C exports only.
// Runs via: npm run test:unit   (Node 22+ node:test, no external deps).

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  stripMarginsIfNeeded,
  stripMarginsDeep,
  wrapPatrolMeta
} = require('../../api/_lib/scope.js');

test('stripMarginsIfNeeded preserves fields for exec', () => {
  const data = {
    kpis: { volume_mt: 100, gross_margin: 0.34, gross_profit: 1234 },
    by_brand: [{ name: 'ViePro', gm_ton: 6500 }]
  };
  const out = stripMarginsIfNeeded(data, { id: 'x', role: 'exec' });
  assert.equal(out.kpis.gross_margin, 0.34);
  assert.equal(out.kpis.gross_profit, 1234);
  assert.equal(out.by_brand[0].gm_ton, 6500);
});

test('stripMarginsIfNeeded preserves fields for ceo', () => {
  const data = { kpis: { gross_profit: 999 } };
  const out = stripMarginsIfNeeded(data, { id: 'x', role: 'CEO' });
  assert.equal(out.kpis.gross_profit, 999);
});

test('stripMarginsIfNeeded removes fields recursively for dsm', () => {
  const data = {
    kpis: {
      volume_mt: 100,
      gross_margin: 0.34,
      gross_profit: 5000,
      last_year: { volume_mt: 80, gross_profit: 4000, gm_ton: 6000 }
    },
    by_brand: [
      { name: 'ViePro', volume_mt: 50, gm_ton: 6500, cogs: 1000 },
      { name: 'PowerBoost', volume_mt: 30, margin_pct: 0.2, unit_cost: 120 }
    ],
    top_customers: [{ name: 'Acme', ytd_gm_ton: 5000, revenue: 1000000 }]
  };

  const out = stripMarginsIfNeeded(data, { id: 'x', role: 'dsm' });

  // non-margin fields preserved
  assert.equal(out.kpis.volume_mt, 100);
  assert.equal(out.by_brand[0].name, 'ViePro');
  assert.equal(out.by_brand[0].volume_mt, 50);
  assert.equal(out.top_customers[0].revenue, 1000000);

  // margins removed everywhere (deleted, not nulled)
  assert.equal('gross_margin' in out.kpis, false);
  assert.equal('gross_profit' in out.kpis, false);
  assert.equal('gross_profit' in out.kpis.last_year, false);
  assert.equal('gm_ton' in out.kpis.last_year, false);
  assert.equal('gm_ton' in out.by_brand[0], false);
  assert.equal('cogs' in out.by_brand[0], false);
  assert.equal('margin_pct' in out.by_brand[1], false);
  assert.equal('unit_cost' in out.by_brand[1], false);
  assert.equal('ytd_gm_ton' in out.top_customers[0], false);
});

test('stripMarginsIfNeeded removes fields for rsm (non-elevated)', () => {
  const data = { kpis: { gross_profit: 1 } };
  const out = stripMarginsIfNeeded(data, { id: 'x', role: 'rsm' });
  assert.equal('gross_profit' in out.kpis, false);
});

test('stripMarginsIfNeeded treats admin as NON-elevated (new policy)', () => {
  // Day-2 brief narrowed elevation to exec+ceo only.
  const data = { kpis: { gross_profit: 1 } };
  const out = stripMarginsIfNeeded(data, { id: 'x', role: 'admin' });
  assert.equal('gross_profit' in out.kpis, false);
});

test('stripMarginsDeep handles arrays of arrays', () => {
  const data = {
    matrix: [
      [ { gp: 1, v: 10 }, { gp: 2, v: 20 } ],
      [ { gp: 3, v: 30 } ]
    ]
  };
  stripMarginsDeep(data);
  assert.equal('gp' in data.matrix[0][0], false);
  assert.equal(data.matrix[0][0].v, 10);
  assert.equal('gp' in data.matrix[1][0], false);
});

test('stripMarginsDeep tolerates null and primitives', () => {
  assert.equal(stripMarginsDeep(null), null);
  assert.equal(stripMarginsDeep(undefined), undefined);
  assert.equal(stripMarginsDeep(42), 42);
  assert.equal(stripMarginsDeep('string'), 'string');
});

test('wrapPatrolMeta includes all meta fields', () => {
  const data = { kpis: { volume_mt: 100 }, scope: { is_empty: false, user_id: 'u', role: 'dsm' } };
  const out = wrapPatrolMeta(data, { id: 'u1', role: 'dsm' }, { period: 'MTD' });

  assert.equal(out.patrol_meta.user_id, 'u1');
  assert.equal(out.patrol_meta.role, 'dsm');
  assert.equal(out.patrol_meta.period, 'MTD');
  assert.equal(out.patrol_meta.is_empty, false);
  assert.deepEqual(out.patrol_meta.hq_scope, data.scope);
  assert.ok(out.patrol_meta.fetched_at, 'fetched_at should be set');
  assert.match(out.patrol_meta.fetched_at, /\d{4}-\d{2}-\d{2}T/, 'ISO timestamp');

  // HQ data still present next to the envelope.
  assert.equal(out.kpis.volume_mt, 100);
});

test('wrapPatrolMeta handles is_empty=true zero-state', () => {
  const data = { scope: { is_empty: true, slpCodes_count: 0 } };
  const out = wrapPatrolMeta(data, { id: 'u', role: 'rsm' }, { period: 'YTD' });
  assert.equal(out.patrol_meta.is_empty, true);
});

test('wrapPatrolMeta gracefully handles missing scope', () => {
  const out = wrapPatrolMeta({ kpis: {} }, { id: 'u', role: 'dsm' }, {});
  assert.equal(out.patrol_meta.hq_scope, null);
  assert.equal(out.patrol_meta.is_empty, false);
});
