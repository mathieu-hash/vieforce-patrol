/**
 * Persisted UI theme for VieForce Patrol (Phase 1).
 * Sets documentElement data-theme; syncs .active on [data-theme-toggle] buttons.
 */
(function () {
  var KEY = 'patrol_theme';
  var root = document.documentElement;

  function getStored() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }
  function setStored(v) {
    try {
      localStorage.setItem(KEY, v);
    } catch (e) {}
  }
  function getSystem() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function apply(t) {
    root.setAttribute('data-theme', t);
    setStored(t);
    var bs = root.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      var target = b.getAttribute('data-theme-toggle');
      if (target === t) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    }
  }
  function init() {
    var stored = getStored();
    apply(stored || getSystem());
    var bs = root.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < bs.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          apply(btn.getAttribute('data-theme-toggle'));
        });
      })(bs[i]);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  window.PatrolTheme = {
    apply: apply,
    get: function () {
      return root.getAttribute('data-theme');
    },
  };
})();
