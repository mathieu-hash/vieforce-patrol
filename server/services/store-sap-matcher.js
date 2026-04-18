// Store ↔ SAP Customer Matcher
// Sprint B — Patrol as Mobile Hub
//
// Given a Patrol store (free-text name, optional GPS + district),
// returns the top SAP accounts from the sap_accounts cache that
// plausibly match, scored by:
//   - name similarity (normalized, word-overlap fallback)
//   - district/region agreement
//   - GPS proximity (<500 m bonus, <100 m strong bonus)
//
// Also exposes confirmMatch() to persist a manual/automated decision:
//   - updates stores row with sap_cardcode + account_type=direct_account
//   - writes an audit row to store_sap_matches
//
// Uses the service-role Supabase client (bypasses RLS) because
// matching candidates must cross TSR-level visibility.

const { createClient } = require('@supabase/supabase-js');

// ── Supabase client factory ──────────────────────────────────
// Cached at module scope; re-used for all calls.
let _cachedClient = null;

function createSupabaseClient() {
  if (_cachedClient) return _cachedClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error(
      'store-sap-matcher: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars required'
    );
  }

  _cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return _cachedClient;
}

// ── Similarity scoring ───────────────────────────────────────
// Returns 0..1. Normalizes common trade-name noise (corp/inc/feeds/agri)
// before comparison so "Metro Feeds Corp." matches "METRO FEEDS".
function similarity(a, b) {
  if (!a || !b) return 0;
  a = String(a).toLowerCase().trim();
  b = String(b).toLowerCase().trim();
  if (a === b) return 1;

  const norm = (s) => s
    .replace(/\b(corp|corporation|inc|incorporated|trading|enterprise|supply|farm|feeds?|agri|agrivet)\b/gi, '')
    .replace(/[^a-z0-9 ]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const na = norm(a);
  const nb = norm(b);

  if (!na || !nb) return 0;
  if (na === nb) return 0.95;
  if (na.includes(nb) || nb.includes(na)) return 0.85;

  // Word overlap — Jaccard-style over words longer than 2 chars
  const wordsA = new Set(na.split(' ').filter((w) => w.length > 2));
  const wordsB = new Set(nb.split(' ').filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let shared = 0;
  wordsA.forEach((w) => { if (wordsB.has(w)) shared++; });
  return shared / Math.max(wordsA.size, wordsB.size);
}

// ── Haversine distance in meters ─────────────────────────────
function haversineDist(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return Infinity;
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Suggest matches ──────────────────────────────────────────
// Returns up to `limit` SAP accounts with score > 0.5, sorted desc.
// Each row is annotated with:
//   score      — 0..1+ (name + district bonus + gps bonus)
//   confidence — 'high' (>0.9), 'medium' (>0.7), 'low' (else)
async function suggestMatches(storeId, limit = 5) {
  if (!storeId) return [];
  const supabase = createSupabaseClient();

  const { data: store, error: storeErr } = await supabase
    .from('stores')
    .select('id, name, address, lat, lng, district, region')
    .eq('id', storeId)
    .single();

  if (storeErr) throw new Error('suggestMatches: store lookup failed — ' + storeErr.message);
  if (!store) return [];

  // Narrow the candidate pool by region when known; fall back to all when not.
  let query = supabase
    .from('sap_accounts')
    .select('cardcode, cardname, district, region, address, lat, lng, slp_code, slp_name')
    .eq('is_active', true)
    .limit(200);

  if (store.region) query = query.eq('region', store.region);

  const { data: candidates, error: candErr } = await query;
  if (candErr) throw new Error('suggestMatches: candidate fetch failed — ' + candErr.message);

  const scored = (candidates || []).map((c) => {
    const nameScore = similarity(store.name, c.cardname);

    const districtMatch = (store.district && c.district &&
      store.district.toLowerCase() === c.district.toLowerCase()) ? 0.1 : 0;

    let gpsScore = 0;
    if (store.lat != null && store.lng != null && c.lat != null && c.lng != null) {
      const dist = haversineDist(store.lat, store.lng, c.lat, c.lng);
      if (dist < 100)      gpsScore = 0.3;
      else if (dist < 500) gpsScore = 0.15;
    }

    const total = nameScore + districtMatch + gpsScore;
    const confidence =
      (nameScore + gpsScore) > 0.9 ? 'high' :
      (nameScore + gpsScore) > 0.7 ? 'medium' : 'low';

    return Object.assign({}, c, { score: total, confidence });
  });

  return scored
    .filter((s) => s.score > 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ── Confirm match (manual or automated) ─────────────────────
// Updates the store row and appends to the audit log.
// `confidence` should be one of: 'manual' | 'fuzzy_high' | 'fuzzy_med' | 'fuzzy_low' | 'gps_match'.
async function confirmMatch(storeId, cardcode, cardname, userId, confidence) {
  if (!storeId || !cardcode) {
    throw new Error('confirmMatch: storeId + cardcode required');
  }
  const supabase = createSupabaseClient();

  const now = new Date().toISOString();

  const { error: storeErr } = await supabase
    .from('stores')
    .update({
      sap_cardcode: cardcode,
      sap_cardname: cardname,
      account_type: 'direct_account',
      sap_mapped_at: now,
      sap_mapped_by: userId || null
    })
    .eq('id', storeId);

  if (storeErr) throw new Error('confirmMatch: store update failed — ' + storeErr.message);

  const { error: logErr } = await supabase
    .from('store_sap_matches')
    .insert({
      store_id: storeId,
      sap_cardcode: cardcode,
      confidence: confidence || 'manual',
      matched_by: userId || null
    });

  if (logErr) throw new Error('confirmMatch: audit insert failed — ' + logErr.message);

  return { success: true, store_id: storeId, sap_cardcode: cardcode, matched_at: now };
}

// ── Unmap ─────────────────────────────────────────────────
// Reverses a mapping. Leaves the audit trail intact.
async function clearMapping(storeId, userId, reason) {
  if (!storeId) throw new Error('clearMapping: storeId required');
  const supabase = createSupabaseClient();

  const { error: storeErr } = await supabase
    .from('stores')
    .update({
      sap_cardcode: null,
      sap_cardname: null,
      account_type: 'pos',
      sap_mapped_at: null,
      sap_mapped_by: null
    })
    .eq('id', storeId);

  if (storeErr) throw new Error('clearMapping: update failed — ' + storeErr.message);

  if (reason) {
    await supabase
      .from('store_sap_matches')
      .insert({
        store_id: storeId,
        sap_cardcode: 'UNMAPPED',
        confidence: 'manual',
        matched_by: userId || null,
        notes: reason
      });
  }

  return { success: true, store_id: storeId };
}

module.exports = {
  similarity,
  haversineDist,
  suggestMatches,
  confirmMatch,
  clearMapping
};
