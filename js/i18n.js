/**
 * Patrol — minimal i18n
 * Single t() function. Locale loaded at boot. User language
 * preference read from PatrolSession.user.language (or default 'en').
 * Phase 4.8 adds locale switcher UI + tl/bis/ceb files.
 */
(function () {
  'use strict';
  var FALLBACK_LOCALE = 'en';
  var currentLocale = FALLBACK_LOCALE;
  /** Pre-merge before fetch so nav labels resolve if fetch is slow */
  var NAV_BOOTSTRAP = {
    'nav.home': 'Home',
    'nav.pos': 'POS',
    'nav.visit': 'Visit',
    'nav.mapa': 'Mapa',
    'nav.me': 'Me',
  };
  var dictionary = Object.assign({}, NAV_BOOTSTRAP);

  /**
   * Load a locale's JSON dictionary.
   * Default locale = 'en'. Phase 4.8 adds 'tl', 'bis', 'ceb'.
   */
  function load(locale) {
    return fetch('/locales/' + locale + '.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('locale fetch failed');
        return r.json();
      })
      .then(function (data) {
        dictionary = Object.assign({}, NAV_BOOTSTRAP, data);
        currentLocale = locale;
      })
      .catch(function (e) {
        if (locale !== FALLBACK_LOCALE) {
          console.warn('[i18n] failed to load ' + locale + ', falling back to ' + FALLBACK_LOCALE);
          return load(FALLBACK_LOCALE);
        }
        console.error('[i18n] failed to load fallback locale', e);
      });
  }

  /**
   * Translate a key. If key not found, returns the key itself (visible
   * to dev so missing translations are obvious).
   * Supports simple {placeholder} interpolation.
   */
  function t(key, vars) {
    var val = dictionary[key];
    if (val === undefined) {
      return key;
    }
    if (vars) {
      for (var k in vars) {
        if (!Object.prototype.hasOwnProperty.call(vars, k)) continue;
        val = val.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
      }
    }
    return val;
  }

  function getUserLocale() {
    try {
      var u = window.PatrolSession && window.PatrolSession.user;
      if (u && (u.language || u.locale)) return String(u.language || u.locale).toLowerCase();
      if (typeof window.getSession === 'function') {
        var s = window.getSession();
        if (s && (s.language || s.locale)) return String(s.language || s.locale).toLowerCase();
      }
      return FALLBACK_LOCALE;
    } catch (e) {
      return FALLBACK_LOCALE;
    }
  }

  /** Initialize on boot. */
  function init() {
    return load(getUserLocale());
  }

  function applyI18nLabels(root) {
    var scope = root || document;
    var els = scope.querySelectorAll('[data-i18n]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    }
  }

  window.PatrolI18n = {
    t: t,
    load: load,
    init: init,
    getCurrentLocale: function () {
      return currentLocale;
    },
    applyI18nLabels: applyI18nLabels,
  };
  window.t = t;
  window.applyI18nLabels = applyI18nLabels;
})();
