// Unit tests for api/_lib/scope.js — Phase C exports only.
// Runs via: npm run test:unit   (Node 22+ node:test, no external deps).

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  stripMarginsIfNeeded,
  stripMarginsDeep,
  wrapPatrolMeta
} = require('../../api/_lib/scope.js');

// ─────────────────────────────────────────────────────────────────────────
// 2026-04-24: margin strip is now UNCONDITIONAL regardless of role.
// Patrol is the field app — no role sees margin data through the proxy.
// Exec + CEO continue to see margins via HQ desktop (vieforce-hq), never
// here. The previous exec/ceo preserve-margins tests are deleted; the
// tests below verify the new behaviour.
// ─────────────────────────────────────────────────────────────────────────

test('stripMarginsIfNeeded strips margins for EVERY role (no bypass)', () => {
  for (const role of ['exec', 'ceo', 'admin', 'evp', 'rsm', 'dsm', 'tsr', 'director', undefined, null, '']) {
    const data = {
      kpis: { volume_mt: 100, gross_margin: 0.34, gross_profit: 1234, gm_ton: 6500 },
      by_brand: [{ name: 'ViePro', gm_per_bag: 290, revenue: 1500000 }]
    };
    const out = stripMarginsIfNeeded(data, role ? { id: 'x', role } : null);
    assert.equal('gross_margin' in out.kpis, false, `role=${role} — gross_margin should be stripped`);
    assert.equal('gross_profit' in out.kpis, false, `role=${role} — gross_profit should be stripped`);
    assert.equal('gm_ton'       in out.kpis, false, `role=${role} — gm_ton should be stripped`);
    assert.equal('gm_per_bag'   in out.by_brand[0], false, `role=${role} — gm_per_bag should be stripped`);
    // Non-margin data preserved
    assert.equal(out.kpis.volume_mt, 100);
    assert.equal(out.by_brand[0].revenue, 1500000);
  }
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


test('stripMargins removes gm_per_bag from by_brand array (2026-04-24 audit)', () => {
  // Regression guard for the leak caught in Jefrey's first DSM smoke test:
  // HQ /api/sales emits by_brand[].gm_per_bag (per-bag gross margin, real
  // pricing intel). Before the audit, this field flowed through untouched
  // for non-exec roles.
  const data = {
    by_brand: [
      { brand: 'ViePro',    volume_mt: 50, revenue: 1500000, gm_per_bag: 292.5, gmt: 5850 },
      { brand: 'PowerBoost', volume_mt: 30, revenue:  900000, gm_per_bag: 185.2, gmt: 4100 }
    ]
  };
  const out = stripMarginsIfNeeded(data, { id: 'x', role: 'dsm' });

  // Volume + revenue preserved
  assert.equal(out.by_brand[0].brand, 'ViePro');
  assert.equal(out.by_brand[0].volume_mt, 50);
  assert.equal(out.by_brand[0].revenue, 1500000);

  // gm_per_bag stripped on every row (deleted, not nulled)
  assert.equal('gm_per_bag' in out.by_brand[0], false);
  assert.equal('gm_per_bag' in out.by_brand[1], false);
  // Existing gmt strip still works — regression check
  assert.equal('gmt' in out.by_brand[0], false);
});

test('stripMargins removes all known margin aliases from a single object', () => {
  // Parametric coverage of every MARGIN_KEYS entry — fails loudly if a
  // future refactor drops one from the constant.
  const { MARGIN_KEYS } = require('../../api/_lib/scope.js');
  const dirty = { safe_field: 'keep me' };
  for (const k of MARGIN_KEYS) dirty[k] = 42;
  const out = stripMarginsIfNeeded({ row: dirty }, { id: 'x', role: 'tsr' });
  assert.equal(out.row.safe_field, 'keep me');
  for (const k of MARGIN_KEYS) {
    assert.equal(k in out.row, false, `expected ${k} to be stripped`);
  }
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
