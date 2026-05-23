// js/_util/skeleton.js
// Skeleton placeholder helper. CLAUDE.md Rule 7 (no spinners for TSRs):
// render gray placeholder blocks instead of "Loading..." text or spinners.
//
// Wire ONCE per HTML shell as a top-level js/ script so PatrolSkeleton is
// available to every subsequent module (vanilla-JS global pattern).
(function (root) {
  'use strict';

  function _buildRow() {
    return (
      '<div class="skeleton-row">' +
        '<div class="skeleton skeleton-circle"></div>' +
        '<div style="flex:1;display:flex;flex-direction:column;gap:6px">' +
          '<div class="skeleton skeleton-line w60"></div>' +
          '<div class="skeleton skeleton-line w80"></div>' +
          '<div class="skeleton skeleton-line w40"></div>' +
        '</div>' +
      '</div>'
    );
  }

  /**
   * Render N skeleton placeholder rows into the given container.
   * @param {HTMLElement} container - target DOM node (innerHTML is replaced).
   * @param {number} [count=3] - number of placeholder rows.
   * @returns {boolean} true if rendered, false if container missing.
   */
  function renderSkeletonRows(container, count) {
    if (!container) return false;
    var n = (typeof count === 'number' && count > 0) ? Math.floor(count) : 3;
    var html = '';
    for (var i = 0; i < n; i++) html += _buildRow();
    container.innerHTML = html;
    container.setAttribute('aria-busy', 'true');
    return true;
  }

  root.PatrolSkeleton = { renderSkeletonRows: renderSkeletonRows };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { renderSkeletonRows: renderSkeletonRows };
  }
})(typeof window !== 'undefined' ? window : globalThis);
