// Scope + margin helpers for the HQ → Patrol proxy.
// ─────────────────────────────────────────────────────────────────────────────
// Phase D (2026-04-19): deprecated applyScopeAndMargins / stripMargins (old) /
// filterRowsByScope / isElevated removed. HQ now handles scope via
// scope=user:<uuid>. Patrol only redacts margins + wraps envelope.
// ─────────────────────────────────────────────────────────────────────────────

// Roles that see every field untouched. Day-2 brief narrowed this from
// [exec, ceo, evp, admin] to [exec, ceo] only.
const NEW_ELEVATED = ['exec', 'ceo'];

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

/** True if the session role sees every field untouched. */
function _isElevated(session) {
  const role = String((session && session.role) || '').toLowerCase();
  return NEW_ELEVATED.indexOf(role) !== -1;
}

/**
 * Strip margin fields for non-exec/non-ceo users. Mutates in place and returns data.
 * Pass-through untouched for elevated roles.
 */
function stripMarginsIfNeeded(data, session) {
  if (_isElevated(session)) return data;
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
