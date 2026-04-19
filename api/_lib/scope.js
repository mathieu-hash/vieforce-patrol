// Scope + margin helpers for the HQ → Patrol proxy.
// ─────────────────────────────────────────────────────────────────────────────
// Phase C (2026-04-19): new exports — stripMarginsIfNeeded, wrapPatrolMeta.
// Old exports (applyScopeAndMargins, stripMargins, filterRowsByScope,
// isElevated) kept for the 6 existing endpoints until Phase D.
// ─────────────────────────────────────────────────────────────────────────────

// Roles that see every field untouched. Day-2 brief tightened this from
// [exec, ceo, evp, admin] to [exec, ceo] only.
const NEW_ELEVATED = ['exec', 'ceo'];

// Union of every margin-related key known to HQ. Delete (not null) so we
// have zero chance of a frontend accidentally rendering a null gm_ton.
// Includes the Day-2 brief list + the wider 11-key superset + ytd_gm_ton
// (only surfaces on /api/customers).
const MARGIN_KEYS = [
  'gross_profit', 'gross_margin', 'margin_pct',
  'cost_of_goods', 'unit_cost', 'gp', 'gm',
  'gm_ton', 'gmt', 'cogs',
  'ytd_gm_ton',
  // Additional legacy aliases we shipped in the old scope.js. Keeping them
  // listed here so Phase D refactor stays a pure swap — no regression.
  'gm_per_ton', 'gross_margin_pct', 'gp_pct', 'margin'
];
const MARGIN_KEY_SET = MARGIN_KEYS.reduce((acc, k) => (acc[k] = 1, acc), {});

// ═══════════════════════════════════════════════════════════════════════════
// Phase C — new exports
// ═══════════════════════════════════════════════════════════════════════════

/** True if the session role sees every field untouched. */
function _isNewElevated(session) {
  const role = String((session && session.role) || '').toLowerCase();
  return NEW_ELEVATED.indexOf(role) !== -1;
}

/**
 * Strip margin fields for non-exec/non-ceo users. Mutates in place and returns data.
 * Pass-through untouched for elevated roles.
 */
function stripMarginsIfNeeded(data, session) {
  if (_isNewElevated(session)) return data;
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

// ═══════════════════════════════════════════════════════════════════════════
// DEPRECATED — still used by the 6 Phase-A /api/sap/* endpoints.
// Will be removed in Phase D cleanup.
// ═══════════════════════════════════════════════════════════════════════════

const ELEVATED_LEGACY = ['exec', 'ceo', 'evp', 'admin'];

/** @deprecated — use `_isNewElevated` via stripMarginsIfNeeded. */
function isElevated(role) {
  return ELEVATED_LEGACY.indexOf(String(role || '').toLowerCase()) !== -1;
}

/** @deprecated — use stripMarginsDeep (deletes keys) instead of nulling. */
function stripMargins(data) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) stripMargins(data[i]);
    return data;
  }
  for (const k in data) {
    if (Object.prototype.hasOwnProperty.call(data, k)) {
      if (MARGIN_KEY_SET[k]) data[k] = null;
      else if (typeof data[k] === 'object') stripMargins(data[k]);
    }
  }
  return data;
}

/** @deprecated — HQ now does user-scoped filtering via scope=user:<uuid>. */
function filterRowsByScope(rows, session) {
  if (!Array.isArray(rows)) return rows;
  const role = String(session.role || '').toLowerCase();

  if (role === 'dsm' && session.district) {
    const my = session.district.toUpperCase();
    return rows.filter(c => {
      const d = String(c && (c.district || c.Territory || c.territory) || '').toUpperCase();
      if (!d) return false;
      return d.indexOf(my) !== -1 || my.indexOf(d) !== -1;
    });
  }
  if (role === 'rsm' && session.region) {
    const my = session.region.toUpperCase();
    return rows.filter(c => {
      const r = String(c && (c.region || c.Region) || '').toUpperCase();
      return r === my;
    });
  }
  return rows;
}

/** @deprecated — compose stripMarginsIfNeeded + wrapPatrolMeta instead. */
function applyScopeAndMargins(session, hqData, listFieldOrFields) {
  if (!hqData || typeof hqData !== 'object') return hqData;
  if (isElevated(session.role)) return hqData;

  const fields = Array.isArray(listFieldOrFields) ? listFieldOrFields : [listFieldOrFields];
  for (const f of fields) {
    if (!f) continue;
    if (Array.isArray(hqData[f])) hqData[f] = filterRowsByScope(hqData[f], session);
  }
  stripMargins(hqData);
  return hqData;
}

module.exports = {
  // Phase C
  stripMarginsIfNeeded,
  stripMarginsDeep,
  wrapPatrolMeta,
  // Deprecated
  isElevated,
  stripMargins,
  filterRowsByScope,
  applyScopeAndMargins
};
