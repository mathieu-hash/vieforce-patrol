// Role-based scope filter + margin stripper for SAP proxy responses.
// Mat's spec, with one extension: the recursive walker covers nested objects
// + arrays so we don't accidentally leak gm_per_ton inside a nested rollup.

const ELEVATED = ['exec', 'ceo', 'evp', 'admin'];

const MARGIN_KEYS = [
  'gm_ton', 'gm_per_ton', 'gmt',
  'gross_margin', 'gross_margin_pct',
  'gp', 'gp_pct',
  'margin', 'margin_pct',
  'cogs', 'cost_of_goods'
];
const MARGIN_KEY_SET = MARGIN_KEYS.reduce((acc, k) => (acc[k] = 1, acc), {});

function isElevated(role) {
  return ELEVATED.indexOf(String(role || '').toLowerCase()) !== -1;
}

// Recursive: nulls every margin key wherever it appears in the response.
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

// Filter an array of customer-like rows by DSM district / RSM region.
// `rows` is the array; `session` carries .role/.district/.region.
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

// Apply scope filter to a known list-bearing field (e.g. 'top_customers')
// then strip margins for non-elevated roles. Returns the (mutated) hqData.
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

module.exports = { isElevated, stripMargins, filterRowsByScope, applyScopeAndMargins };
