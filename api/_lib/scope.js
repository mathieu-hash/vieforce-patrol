// Scope + margin helpers for the HQ → Patrol proxy.
// ─────────────────────────────────────────────────────────────────────────────
// Phase D (2026-04-19): deprecated applyScopeAndMargins / stripMargins (old) /
// filterRowsByScope / isElevated removed. HQ now handles scope via
// scope=user:<uuid>. Patrol only redacts margins + wraps envelope.
// ─────────────────────────────────────────────────────────────────────────────

// 2026-04-24: role-based elevation REMOVED. Patrol = field app = zero
// margin exposure, regardless of who is logged in. Exec/CEO see margins
// on HQ desktop (vieforce-hq), never through the Patrol proxy. This
// removes an entire class of "wrong x-session-id happened to belong to
// Mat → margins leak to a field phone" failure modes.

// Union of every margin-related key known to HQ. Delete (not null) so we
// have zero chance of a frontend accidentally rendering a null gm_ton.
// Includes the Day-2 brief list + wider 11-key superset + ytd_gm_ton
// (surfaces on /api/customers).
const MARGIN_KEYS = [
  'gross_profit', 'gross_margin', 'margin_pct',
  'cost_of_goods', 'unit_cost', 'gp', 'gm',
  'gm_ton', 'gmt', 'cogs',
  'ytd_gm_ton',
  // Legacy aliases carried over from the old scope.js so the Phase D swap
  // stays a pure migration — no regression in margin coverage.
  'gm_per_ton', 'gross_margin_pct', 'gp_pct', 'margin',
  // 2026-04-24 audit: by_brand[].gm_per_bag leaked to Jefrey's DSM view
  // (first scoped smoke test). HQ emits it alongside gmt/revenue/volume.
  'gm_per_bag'
];
const MARGIN_KEY_SET = MARGIN_KEYS.reduce((acc, k) => (acc[k] = 1, acc), {});

/**
 * Strips margin fields from response data — ALWAYS, regardless of role.
 * Patrol = field app = no margin exposure. Margin data is only visible
 * via HQ desktop (vieforce-hq). The `session` parameter is kept for
 * backward compatibility with callers (all six /api/sap/* handlers pass
 * it) but is ignored.
 */
function stripMarginsIfNeeded(data, _session) {
  return stripMarginsDeep(data);
}

/**
 * Recursively delete every known margin key from arrays + nested objects.
 * Returns the (mutated) input for ergonomic chaining.
 */
function stripMarginsDeep(obj) {
  if (obj == null) return obj;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) stripMarginsDeep(obj[i]);
    return obj;
  }
  if (typeof obj !== 'object') return obj;
  for (const k in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
    if (MARGIN_KEY_SET[k]) {
      delete obj[k];
      continue;
    }
    const v = obj[k];
    if (v && typeof v === 'object') stripMarginsDeep(v);
  }
  return obj;
}

/**
 * Wrap HQ response with a Patrol meta envelope. patrol_meta comes first so
 * spreading HQ data doesn't overwrite our identification block (HQ never
 * returns a `patrol_meta` key, but defence in depth).
 */
function wrapPatrolMeta(data, session, params) {
  params = params || {};
  session = session || {};
  const scope = data && typeof data === 'object' ? data.scope : null;
  return Object.assign(
    {
      patrol_meta: {
        user_id: session.id || null,
        role: session.role || null,
        period: params.period || null,
        hq_scope: scope || null,
        is_empty: !!(scope && scope.is_empty),
        fetched_at: new Date().toISOString()
      }
    },
    data || {}
  );
}

module.exports = {
  stripMarginsIfNeeded,
  stripMarginsDeep,
  wrapPatrolMeta,
  MARGIN_KEYS
};
