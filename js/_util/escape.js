// js/_util/escape.js
// Single source of truth for HTML escaping. Replaces ~15 inline variants.
// Wire ONCE per HTML shell as the very first js/ script so PatrolEscape is
// available to every subsequent module (vanilla-JS global pattern).
(function (root) {
  'use strict';
  var ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;' };

  function escapeHtml(v) {
    if (v == null) return '';
    return String(v).replace(/[&<>"'\/]/g, function (c) { return ENT[c]; });
  }

  function escapeAttr(v) {
    // For HTML attribute values inside double quotes.
    if (v == null) return '';
    return String(v).replace(/[&<>"]/g, function (c) { return ENT[c]; });
  }

  root.PatrolEscape = { escapeHtml: escapeHtml, escapeAttr: escapeAttr };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { escapeHtml: escapeHtml, escapeAttr: escapeAttr };
  }
})(typeof window !== 'undefined' ? window : globalThis);
