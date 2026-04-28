/**
 * Pure helpers + navStoresWithFilter() — Sales/Pulse → Stores one-shot filter handoff.
 * Loaded before stores.js / sales-tab uses nav at interaction time.
 */
(function (global) {
  'use strict';

  var CHIP = { all: 1, crit: 1, warn: 1, ok: 1, prospect: 1, active: 1 };

  function normalizeStoresChipLabel(raw) {
    var l = String(raw == null ? 'all' : raw).trim().toLowerCase();
    return CHIP[l] ? l : 'all';
  }

  function storesNavPrefToFilter(label, searchVal) {
    var l = normalizeStoresChipLabel(label);
    var filter = {};
    if (l === 'crit' || l === 'warn' || l === 'ok') filter.health_status = l;
    else if (l === 'prospect') filter.store_status = 'prospect';
    else if (l === 'active') filter.store_status = 'active';
    var sv = searchVal && String(searchVal).trim();
    if (sv) filter.search = sv;
    return filter;
  }

  function navStoresWithFilter(label) {
    try {
      sessionStorage.setItem('patrol_stores_nav_pref', normalizeStoresChipLabel(label));
    } catch (_e) {}
    if (typeof global.nav === 'function') global.nav('page-stores');
  }

  global.normalizeStoresChipLabel = normalizeStoresChipLabel;
  global.storesNavPrefToFilter = storesNavPrefToFilter;
  global.navStoresWithFilter = navStoresWithFilter;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      normalizeStoresChipLabel: normalizeStoresChipLabel,
      storesNavPrefToFilter: storesNavPrefToFilter
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
