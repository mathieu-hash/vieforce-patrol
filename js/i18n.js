/**
 * Patrol — PatrolI18n JSON locale layer (Phase 4.8)
 * Canonical locales: en, tl, ceb. Bridges legacy labels-v2 (TL/BIS/EN) on setLocale.
 */
(function () {
  'use strict';
  var FALLBACK_LOCALE = 'en';
  var SUPPORTED = { en: true, tl: true, ceb: true };
  var currentLocale = FALLBACK_LOCALE;
  /** Pre-merge before fetch so nav labels resolve if fetch is slow */
  var NAV_BOOTSTRAP = {
    'nav.home': 'Home',
    'nav.pos': 'POS',
    'nav.visit': 'Visit',
    'nav.mapa': 'Mapa',
    'nav.me': 'Me',
    'nav.stores': 'Stores',
    'nav.team': 'Team',
    'nav.sales': 'Sales',
    'nav.leaders': 'Leaders',
    'nav.more': 'More',
    'tsr.nba_loading': 'Loading next action…',
    'profile.loading': '…',
    'tindahan.empty_cta_hdr': 'Tap ✏️ above to register a new POS',
    'tindahan.empty_cta_fab': 'Tap the + button to register a new POS'
  };
  var dictionary = Object.assign({}, NAV_BOOTSTRAP);

  function normalizeLocale(raw) {
    var s = String(raw || '')
      .trim()
      .toLowerCase();
    if (s === 'bis' || s === 'ceb' || s === 'cebuano' || s === 'bisaya') return 'ceb';
    if (s === 'fil' || s === 'tl' || s === 'tagalog' || s === 'tg') return 'tl';
    if (s === 'en' || s === 'english') return 'en';
    if (SUPPORTED[s]) return s;
    return FALLBACK_LOCALE;
  }

  function legacyLangFromLocale(locale) {
    if (locale === 'tl') return 'TL';
    if (locale === 'ceb') return 'BIS';
    return 'EN';
  }

  function mapLegacyStorageLang(upper) {
    if (upper === 'TL') return 'tl';
    if (upper === 'BIS') return 'ceb';
    if (upper === 'EN') return 'en';
    return null;
  }

  /**
   * Load a locale's JSON dictionary.
   */
  function load(locale) {
    var code = normalizeLocale(locale);
    return fetch('/locales/' + code + '.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('locale fetch failed');
        return r.json();
      })
      .then(function (data) {
        dictionary = Object.assign({}, NAV_BOOTSTRAP, data);
        currentLocale = code;
        // Round 8 a11y sweep (2026-05-25): keep <html lang> in sync with the
        // active PatrolI18n locale so screen readers announce trilingual
        // content correctly. Codes are BCP47-compatible (en / tl / ceb).
        try {
          if (typeof document !== 'undefined' && document.documentElement) {
            document.documentElement.setAttribute('lang', code);
          }
        } catch (e3) {}
      })
      .catch(function (e) {
        if (code !== FALLBACK_LOCALE) {
          console.warn('[i18n] failed to load ' + code + ', falling back to ' + FALLBACK_LOCALE);
          return load(FALLBACK_LOCALE);
        }
        console.error('[i18n] failed to load fallback locale', e);
      });
  }

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
      if (u && (u.language || u.locale)) {
        var n = normalizeLocale(u.language || u.locale);
        if (n) return n;
      }
      if (typeof window.getSession === 'function') {
        var s = window.getSession();
        if (s && (s.language || s.locale)) {
          return normalizeLocale(s.language || s.locale);
        }
      }
      try {
        var pl = localStorage.getItem('patrol_locale');
        if (pl) return normalizeLocale(pl);
      } catch (e1) {}
      try {
        var leg = mapLegacyStorageLang((localStorage.getItem('patrol_lang') || '').toUpperCase());
        if (leg) return leg;
      } catch (e2) {}
      return FALLBACK_LOCALE;
    } catch (e) {
      return FALLBACK_LOCALE;
    }
  }

  /** Initialize on boot. */
  function init() {
    return load(getUserLocale()).then(function () {
      if (typeof window.setLanguage === 'function') {
        window.setLanguage(legacyLangFromLocale(currentLocale), {
          silent: true,
          source: 'patrol-i18n-bridge'
        });
      }
      applyI18nLabels(document.body);
    });
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

  /**
   * Switch locale, refresh JSON dictionary, data-i18n, and labels-v2 bridge. No page reload.
   * @param {string} locale
   * @param {{skipEvent?:boolean}} opts
   */
  function setLocale(locale, opts) {
    opts = opts || {};
    var code = normalizeLocale(locale);
    return load(code).then(function () {
      applyI18nLabels(document.body);
      try {
        localStorage.setItem('patrol_locale', code);
      } catch (e0) {}
      if (typeof window.setLanguage === 'function') {
        window.setLanguage(legacyLangFromLocale(code), {
          silent: true,
          source: 'patrol-i18n-bridge'
        });
      }
      if (!opts.skipEvent) {
        try {
          window.dispatchEvent(
            new CustomEvent('patrol:locale-changed', { detail: { locale: code } })
          );
        } catch (e1) {}
      }
      return code;
    });
  }

  /**
   * Persist preference server-side + session, then notify listeners.
   */
  function saveUserLocale(localeCode) {
    var code = normalizeLocale(localeCode);
    return setLocale(code, { skipEvent: true }).then(function () {
      var session = typeof window.getSession === 'function' ? window.getSession() : null;
      if (session && session.id) {
        // W1-AuthCore: PATCH with Supabase Auth Bearer JWT.
        var bearerPromise = (typeof window.getAuthBearer === 'function')
          ? window.getAuthBearer()
          : Promise.resolve(null);
        return bearerPromise.then(function (bearer) {
          if (!bearer) return code;
          return fetch('/api/user/language', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + bearer
            },
            body: JSON.stringify({ language: code })
          })
            .then(function (res) {
              if (!res.ok) {
                console.warn('[i18n] saveUserLocale HTTP', res.status);
              }
              return code;
            })
            .catch(function (err) {
              console.warn('[i18n] saveUserLocale failed', err && err.message);
              return code;
            });
        });
      }
      return Promise.resolve(code);
    }).then(function () {
      if (typeof window.patchPatrolSession === 'function') {
        window.patchPatrolSession({ language: code, locale: code });
      }
      try {
        window.dispatchEvent(
          new CustomEvent('patrol:locale-changed', { detail: { locale: code, saved: true } })
        );
      } catch (e2) {}
      return code;
    });
  }

  window.PatrolI18n = {
    t: t,
    load: load,
    init: init,
    setLocale: setLocale,
    saveUserLocale: saveUserLocale,
    normalizeLocale: normalizeLocale,
    getCurrentLocale: function () {
      return currentLocale;
    },
    applyI18nLabels: applyI18nLabels,
    legacyLangFromLocale: legacyLangFromLocale
  };
  window.t = t;
  window.applyI18nLabels = applyI18nLabels;
})();
