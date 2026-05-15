/**
 * Phase 4.8 — Profile language settings row + bottom sheet (PatrolI18n canonical en/tl/ceb).
 */
(function () {
  'use strict';

  function currentCode() {
    if (window.PatrolI18n && typeof PatrolI18n.getCurrentLocale === 'function') {
      return PatrolI18n.getCurrentLocale();
    }
    return 'en';
  }

  function refreshSummary() {
    if (!window.PatrolI18n || typeof PatrolI18n.t !== 'function') return;
    var code = currentCode();
    var el = document.getElementById('patrol-lang-summary-value');
    if (el) {
      var key =
        code === 'tl'
          ? 'profile.lang_native_tl'
          : code === 'ceb'
            ? 'profile.lang_native_ceb'
            : 'profile.lang_native_en';
      el.textContent = PatrolI18n.t(key);
    }
    var card = document.getElementById('patrol-lang-settings-card');
    if (card) card.setAttribute('data-active-locale', code);
    var sh = document.getElementById('patrol-lang-sheet');
    if (sh && sh.classList.contains('open')) {
      sh.querySelectorAll('[data-locale-option]').forEach(function (btn) {
        var opt = btn.getAttribute('data-locale-option');
        btn.classList.toggle('is-selected', opt === code);
      });
    }
  }

  window.refreshPatrolLangSummary = refreshSummary;

  function closeSheet() {
    var sh = document.getElementById('patrol-lang-sheet');
    if (sh) {
      sh.classList.remove('open');
      sh.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
  }

  function openSheet() {
    var sh = document.getElementById('patrol-lang-sheet');
    if (!sh) return;
    if (typeof window.applyI18nLabels === 'function') {
      window.applyI18nLabels(sh);
    }
    sh.classList.add('open');
    sh.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    refreshSummary();
  }

  function showToast(msg) {
    var existing = document.getElementById('patrol-locale-toast');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    var toast = document.createElement('div');
    toast.id = 'patrol-locale-toast';
    toast.className = 'patrol-locale-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(function () {
      toast.classList.add('visible');
    });
    setTimeout(function () {
      toast.classList.remove('visible');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 320);
    }, 2400);
  }

  function chooseLocale(code) {
    if (!window.PatrolI18n || typeof PatrolI18n.saveUserLocale !== 'function') return;
    PatrolI18n.saveUserLocale(code).then(function () {
      closeSheet();
      if (window.PatrolI18n && typeof PatrolI18n.t === 'function') {
        showToast(PatrolI18n.t('profile.toast_language_saved'));
      }
      refreshSummary();
      if (typeof window.renderNav === 'function') window.renderNav();
      if (typeof window.rerenderCurrentPage === 'function') window.rerenderCurrentPage();
    });
  }

  function bind() {
    var row = document.getElementById('patrol-lang-summary-row');
    if (row) row.addEventListener('click', openSheet);
    var backdrop = document.querySelector('#patrol-lang-sheet .patrol-lang-sheet-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeSheet);
    var panel = document.querySelector('#patrol-lang-sheet .patrol-lang-sheet-panel');
    if (panel) {
      panel.addEventListener('click', function (e) {
        e.stopPropagation();
      });
    }
    document.querySelectorAll('#patrol-lang-sheet [data-locale-option]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        chooseLocale(btn.getAttribute('data-locale-option'));
      });
    });
    window.addEventListener('patrol:locale-changed', refreshSummary);
    refreshSummary();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
