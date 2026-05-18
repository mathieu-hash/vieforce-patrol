/**
 * Pilot feature flags — opt-in mock / demo surfaces (default: off).
 * Reads CONFIG.PATROL_FEATURES from config.js (must load before this file).
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    socialFeed: false,
    salesVelocityChart: false,
    salesSubModules: false,
    mapaFullMap: false,
    storeSapBadges: false,
    phase4Social: false,
    vetRoiCard: false
  };

  function _features() {
    var C = global.CONFIG || {};
    var f = C.PATROL_FEATURES || {};
    var out = {};
    var k;
    for (k in DEFAULTS) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, k)) continue;
      out[k] = f[k] === true;
    }
    return out;
  }

  function patrolFeatureEnabled(key) {
    var feats = _features();
    return feats[key] === true;
  }

  global.patrolFeatures = _features;
  global.patrolFeatureEnabled = patrolFeatureEnabled;
})(typeof window !== 'undefined' ? window : globalThis);
