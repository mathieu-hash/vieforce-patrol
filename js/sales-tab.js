// Sales tab — live SAP summary via Patrol /api/sap/sales (HQ /api/sales proxy).

(function () {
  'use strict';

  var CACHE_MS = 28000;
  var _lastKey = '';
  var _lastAt = 0;
  var _lastData = null;     // HQ /api/sap/sales response (hero, scope, freshness)
  var _lastDirect = null;   // Direct SAP /api/sap/sales/all response
  var _periodBound = false;
  var _unitBound = false;
  var _currentUnit = 'BAGS'; // 'BAGS' | 'MT'

  function _esc(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function _fmtVolumeMt(n) {
    if (n == null || n === '') return '—';
    var v = parseFloat(n);
    if (isNaN(v)) return '—';
    return v.toLocaleString('en-PH', { maximumFractionDigits: 3 });
  }

  function _fmtIntish(n) {
    if (n == null || n === '') return '—';
    var v = parseFloat(n);
    if (isNaN(v)) return '—';
    return v.toLocaleString('en-PH', { maximumFractionDigits: 0 });
  }

  function _formatFreshness(iso) {
    if (!iso) return '';
    var t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    var diffMs = Date.now() - t;
    if (diffMs < 0) diffMs = 0;
    var sec = Math.floor(diffMs / 1000);
    if (sec < 60) return 'just now';
    var min = Math.floor(sec / 60);
    if (min < 60) return min + ' min ago';
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + 'h ago';
    var day = Math.floor(hr / 24);
    return day + 'd ago';
  }

  /**
   * Returns { label, value, formatted, loading } for the current hero unit,
   * sourced from HQ (MT) and direct-SAP (Bags). When the data for the chosen
   * unit isn't loaded yet, returns loading=true so the UI can show a skeleton
   * instead of a misleading "—".
   */
  function _heroForUnit(unit, hqData, directData) {
    if (unit === 'MT') {
      var hqKpis = (hqData && hqData.kpis) || {};
      var hasMt = hqKpis && hqKpis.volume_mt != null && hqKpis.volume_mt !== '';
      return {
        label: 'Volume (MT)',
        value: hasMt ? hqKpis.volume_mt : null,
        formatted: hasMt ? _fmtVolumeMt(hqKpis.volume_mt) : '',
        loading: !hasMt
      };
    }
    var directKpis = (directData && directData.kpis) || null;
    var hasBags = directKpis && directKpis.bags != null;
    return {
      label: 'Bags',
      value: hasBags ? directKpis.bags : null,
      formatted: hasBags ? _fmtIntish(directKpis.bags) : '',
      loading: !directKpis
    };
  }

  function _showLoading(container) {
    container.innerHTML =
      '<div class="sales-sap-loading" role="status">' +
      '<span class="sales-sap-spinner" aria-hidden="true"></span> ' +
      '<span>Loading sales…</span></div>';
  }

  function _showError(container, period, errObj) {
    var status = errObj && errObj.status;
    var msg =
      (errObj && errObj.message) ||
      (errObj && errObj.error) ||
      'Could not load sales data.';
    if (status === 502 || status === 504) {
      msg = status === 504
        ? 'SAP/HQ did not respond in time. Try again.'
        : 'SAP/HQ returned an error. Try again.';
    }
    container.innerHTML =
      '<div class="sales-sap-error" role="alert">' +
      '<p>' + _esc(msg) + '</p>' +
      '<button type="button" class="sales-sap-retry">' + _esc('Retry') + '</button></div>';
    var btn = container.querySelector('.sales-sap-retry');
    if (btn) {
      btn.addEventListener('click', function () {
        _lastKey = '';
        refreshSalesTab(period);
      });
    }
  }

  function _render(container, data, period) {
    var pm = data.patrol_meta || {};
    var scope = pm.hq_scope || data.scope || {};
    var isEmpty = !!(pm.is_empty || scope.is_empty);

    if (isEmpty) {
      container.innerHTML =
        '<div class="sales-sap-empty">' +
        '<p><strong>No SAP scope for this account.</strong></p>' +
        '<p class="sales-sap-empty-hint">Check user mapping in VieForce HQ or Supabase. ' +
        'If you need the full desktop dashboard, use Open HQ below.</p></div>';
      return;
    }

    var hero = _heroForUnit(_currentUnit, data, _lastDirect);
    var heroValueHtml = hero.loading
      ? '<span class="sales-hero-skeleton" aria-label="Loading">…</span>'
      : hero.formatted;
    var heroLabel = (_currentUnit === 'MT' ? 'TOTAL MT' : 'TOTAL BAGS') + ' \u00b7 ' + period;

    var scopeLabel =
      (scope.district_label && String(scope.district_label)) ||
      (pm.district_label && String(pm.district_label)) ||
      (pm.name && String(pm.name)) ||
      '';

    var heroHtml =
      '<div class="sales-hero-card">' +
      '<div class="sales-hero-row">' +
      '<div class="sales-hero-icon" aria-hidden="true">' + _icon('box') + '</div>' +
      '<div class="sales-hero-text">' +
      '<div class="sales-hero-label">' + _esc(heroLabel) + '</div>' +
      '<div class="sales-hero-value" id="sales-hero-value">' + heroValueHtml + '</div>' +
      '</div>' +
      '</div>' +
      '<div class="sales-hero-divider"></div>' +
      '<div class="sales-hero-foot">' +
      '<div class="sales-hero-foot-left">' + (scopeLabel ? _esc(scopeLabel) : '') + '</div>' +
      '<div id="sales-sap-fresh-host"></div>' +
      '</div>' +
      '</div>';

    var insightsHtml =
      '<div class="sales-section">' +
      '<div class="sales-section-title">QUICK INSIGHTS</div>' +
      '<div class="sales-insights-row">' +
      '<div class="sales-insight-card sales-insight-amber">' +
      '<div class="sales-insight-head">' + _icon('chart-line', 'amber') + '<span>Whitespace</span></div>' +
      '<div class="sales-insight-value" id="sales-insight-whitespace">…</div>' +
      '<div class="sales-insight-sub">stores with 0 bags</div>' +
      '</div>' +
      '<div class="sales-insight-card sales-insight-rose">' +
      '<div class="sales-insight-head">' + _icon('alert', 'rose') + '<span>At risk</span></div>' +
      '<div class="sales-insight-value" id="sales-insight-atrisk">…</div>' +
      '<div class="sales-insight-sub">stores slowing or stopped</div>' +
      '</div>' +
      '</div>' +
      '</div>';

    var brandHtml =
      '<div class="sales-section">' +
      '<div class="sales-section-title">BREAKDOWN</div>' +
      '<div class="sales-card sales-by-brand-card">' +
      '<div class="sales-card-title-row"><span class="sales-card-title-with-icon">' +
      _icon('tags', 'primary') + '<span>By brand</span></span><span class="sales-card-meta">Top 5</span></div>' +
      '<div class="sales-card-body" id="sales-by-brand-body">' +
      '<div class="sales-card-loading">Loading…</div>' +
      '</div></div>' +
      '<div class="sales-card sales-by-customer">' +
      '<div class="sales-card-title-row"><span class="sales-card-title-with-icon">' +
      _icon('users', 'primary') + '<span>By customer</span></span><span class="sales-card-meta">Top 5</span></div>' +
      '<div class="sales-card-body" id="sales-by-customer-body">' +
      '<div class="sales-card-loading">Loading…</div>' +
      '</div></div>' +
      '</div>';

    var detailHtml =
      '<div class="sales-section">' +
      '<div class="sales-section-title">FIELD ACTIONS</div>' +
      '<div class="sales-card sales-whitespace">' +
      '<div class="sales-card-title-row"><span class="sales-card-title-with-icon">' +
      _icon('flag', 'amber') + '<span>Whitespace</span></span><span class="sales-card-meta">0 bags this month</span></div>' +
      '<div class="sales-card-body" id="sales-whitespace-body">' +
      '<div class="sales-card-loading">Loading…</div>' +
      '</div></div>' +
      '<div class="sales-card sales-at-risk">' +
      '<div class="sales-card-title-row"><span class="sales-card-title-with-icon">' +
      _icon('alert', 'rose') + '<span>At risk</span></span><span class="sales-card-meta">Last 14d+</span></div>' +
      '<div class="sales-card-body" id="sales-at-risk-body">' +
      '<div class="sales-card-loading">Loading…</div>' +
      '</div></div>' +
      '</div>';

    container.innerHTML = heroHtml + insightsHtml + brandHtml + detailHtml;

    if (_lastDirect) {
      _renderDirectCards(_lastDirect);
      _updateInsightCounts(_lastDirect);
      _updateFreshness('ok');
    } else {
      _updateFreshness('loading');
    }
    _loadAllDirectSap(period);
  }

  function _icon(name, tone) {
    var color = tone === 'amber' ? '#b45309'
      : tone === 'rose' ? '#be123c'
      : tone === 'primary' ? '#00A6CE'
      : 'currentColor';
    var stroke = 'stroke="' + color + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
    var paths = {
      'box': '<rect x="3.5" y="6" width="17" height="14" rx="2"/><path d="M3.5 10h17M9 6V4h6v2"/>',
      'tags': '<path d="M20 12 13 5H4v9l7 7 9-9z"/><circle cx="8" cy="8" r="1.4"/>',
      'users': '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M14 20c0-2.5 2-4 4.5-4S22 17.5 22 20"/>',
      'flag': '<path d="M5 3v18M5 4h11l-2 4 2 4H5"/>',
      'alert': '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v5M12 18v.5"/>',
      'chart-line': '<path d="M4 4v16h16"/><path d="M7 15l4-5 4 3 5-7"/>',
      'arrow-right': '<path d="M9 6l6 6-6 6"/>',
      'briefcase': '<rect x="3.5" y="7" width="17" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>'
    };
    var inner = paths[name] || paths['box'];
    return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" ' + stroke + '>' + inner + '</svg>';
  }

  function _updateInsightCounts(direct) {
    if (!direct) return;
    var ws = (direct.whitespace || []).length;
    var ar = (direct.at_risk || []).length;
    var wEl = document.getElementById('sales-insight-whitespace');
    var aEl = document.getElementById('sales-insight-atrisk');
    if (wEl) wEl.textContent = _fmtIntish(ws);
    if (aEl) aEl.textContent = _fmtIntish(ar);
  }

  function _updateHero() {
    if (!_lastData) return;
    var el = document.getElementById('sales-hero-value');
    var lbl = document.querySelector('.sales-kpi-hero .sales-kpi-label');
    if (!el) return;
    var hero = _heroForUnit(_currentUnit, _lastData, _lastDirect);
    if (hero.loading) {
      el.innerHTML = '<span class="sales-hero-skeleton">…</span>';
    } else {
      el.textContent = hero.formatted;
    }
    if (lbl) lbl.textContent = hero.label;
  }

  function _updateFreshness(state) {
    var host = document.getElementById('sales-sap-fresh-host');
    if (!host) return;
    if (state === 'loading') {
      host.innerHTML =
        '<div class="sales-sap-fresh sales-sap-fresh-loading" role="status" aria-live="polite">' +
        '<span class="sales-sap-fresh-dot sales-sap-fresh-dot-loading" aria-hidden="true"></span>' +
        '<span>Loading SAP…</span></div>';
    } else if (state === 'error') {
      host.innerHTML =
        '<div class="sales-sap-fresh sales-sap-fresh-err" role="status">' +
        '<span class="sales-sap-fresh-dot sales-sap-fresh-dot-err" aria-hidden="true"></span>' +
        '<span>SAP unreachable</span></div>';
    } else if (state === 'ok' && _lastDirect) {
      var iso = (_lastDirect.patrol_meta && _lastDirect.patrol_meta.fetched_at) ||
        (_lastData && _lastData.patrol_meta && _lastData.patrol_meta.fetched_at);
      var label = _formatFreshness(iso);
      host.innerHTML = label
        ? '<div class="sales-sap-fresh" role="status" aria-live="polite">' +
          '<span class="sales-sap-fresh-dot" aria-hidden="true"></span>' +
          '<span>SAP synced ' + _esc(label) + '</span></div>'
        : '';
    } else {
      host.innerHTML = '';
    }
  }

  /** Single round-trip: by_brand + by_customer + whitespace + at_risk in parallel server-side.
   *  Has a 18s client-side timeout so a hung Vercel/SAP doesn't leave cards "Loading…" forever.
   */
  async function _loadAllDirectSap(period) {
    var brEl = document.getElementById('sales-by-brand-body');
    var byEl = document.getElementById('sales-by-customer-body');
    var wsEl = document.getElementById('sales-whitespace-body');
    var arEl = document.getElementById('sales-at-risk-body');

    var url = '/api/sap/sales/all?period=' + encodeURIComponent(period);
    var session = (typeof getSession === 'function') ? getSession() : null;
    if (!session || !session.id) {
      _spreadError([brEl, byEl, wsEl, arEl], { message: 'Session missing. Sign in again.' });
      return;
    }

    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 18000) : null;

    var data;
    try {
      var res = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': session.id
        },
        credentials: 'include',
        signal: ctrl ? ctrl.signal : undefined
      });
      if (timer) clearTimeout(timer);
      if (!res.ok) {
        var errBody = null;
        try { errBody = await res.json(); } catch (_e) {}
        data = errBody || { error: 'FETCH_FAILED', status: res.status };
      } else {
        data = await res.json();
      }
    } catch (e) {
      if (timer) clearTimeout(timer);
      var aborted = e && e.name === 'AbortError';
      data = {
        error: aborted ? 'TIMEOUT' : 'FETCH_EXCEPTION',
        message: aborted
          ? 'SAP took too long to respond. Try again.'
          : 'SAP server unreachable. Try again.'
      };
    }

    if (!data || data.error) {
      _spreadError(
        [brEl, byEl, wsEl, arEl],
        data || { error: 'SAP server unreachable. Try again.' }
      );
      _injectDirectRetry(period, data && data.message);
      _updateFreshness('error');
      return;
    }

    _lastDirect = data;
    _updateHero();
    _renderDirectCards(data);
    _updateInsightCounts(data);
    _updateFreshness('ok');
  }

  function _spreadError(els, errObj) {
    for (var i = 0; i < els.length; i++) _renderEmptyOrError(els[i], errObj);
  }

  function _injectDirectRetry(period, message) {
    var existing = document.getElementById('sales-direct-retry');
    if (existing) existing.parentNode.removeChild(existing);
    var anchor = document.querySelector('.sales-by-brand-card');
    if (!anchor || !anchor.parentNode) return;
    var box = document.createElement('div');
    box.id = 'sales-direct-retry';
    box.className = 'sales-sap-error';
    box.setAttribute('role', 'alert');
    box.innerHTML =
      '<p>' + _esc(message || 'SAP server unreachable. Try again.') + '</p>' +
      '<button type="button" class="sales-sap-retry">Retry</button>';
    anchor.parentNode.insertBefore(box, anchor);
    var btn = box.querySelector('.sales-sap-retry');
    if (btn) {
      btn.addEventListener('click', function () {
        box.parentNode.removeChild(box);
        _loadAllDirectSap(period);
      });
    }
  }

  function _renderDirectCards(data) {
    _renderByBrand(document.getElementById('sales-by-brand-body'), data.by_brand || []);
    _renderByCustomer(document.getElementById('sales-by-customer-body'), data.by_customer || []);
    _renderWhitespace(document.getElementById('sales-whitespace-body'), data.whitespace || []);
    _renderAtRisk(document.getElementById('sales-at-risk-body'), data.at_risk || []);
  }

  var _BRAND_DOTS = ['#00A6CE', '#10B981', '#F59E0B', '#8B5CF6', '#3B82F6'];

  function _renderByBrand(el, brands) {
    if (!el) return;
    var list = (brands || []).slice(0, 5);
    if (!list.length) {
      el.innerHTML = '<div class="sales-card-empty">No brand breakdown for this period.</div>';
      return;
    }
    var total = 0;
    for (var t = 0; t < list.length; t++) total += parseFloat(list[t].bags) || 0;
    if (total <= 0) total = 0;

    var html = '';
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var name = (r && r.name) || '(no brand)';
      var bags = parseFloat(r && r.bags) || 0;
      var pct = total > 0 ? Math.round((bags / total) * 100) : 0;
      var dot = _BRAND_DOTS[i % _BRAND_DOTS.length];
      html +=
        '<div class="sales-row sales-brand-row-luxe">' +
        '<span class="sales-brand-name"><span class="sales-brand-dot" style="background:' + dot + '"></span>' +
        _esc(name) + '</span>' +
        '<span class="sales-brand-meta">' +
        '<strong>' + _fmtIntish(bags) + '</strong>' +
        '<span class="sales-brand-pct">' + pct + '%</span>' +
        '</span></div>';
    }
    el.innerHTML = html;
  }

  function _renderEmptyOrError(el, errObj) {
    if (!el) return;
    // Prefer human message over raw error code.
    var msg = (errObj && errObj.message) ||
      (errObj && errObj.error === 'SAP_UNAVAILABLE' && 'SAP server unreachable. Try again.') ||
      (errObj && errObj.error) ||
      'Could not load.';
    el.innerHTML =
      '<div class="sales-card-empty">' +
      _esc(msg) +
      '</div>';
  }

  function _renderByCustomer(el, byCustomer) {
    if (!el) return;
    var list = (byCustomer || []).slice(0, 5);
    if (!list.length) {
      el.innerHTML = '<div class="sales-card-empty">No invoiced customers in this period.</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      html +=
        '<div class="sales-row">' +
        '<span class="sales-row-name">' + _esc(r.name || r.cardcode || '—') + '</span>' +
        '<strong class="sales-row-value">' + _fmtIntish(r.bags) + ' bags</strong>' +
        '</div>';
    }
    el.innerHTML = html;
  }

  function _renderWhitespace(el, whitespace) {
    if (!el) return;
    var list = (whitespace || []).slice(0, 5);
    if (!list.length) {
      el.innerHTML = '<div class="sales-card-empty">All BPs invoiced this month.</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var phone = r.phone ? '<a href="tel:' + _esc(r.phone) + '" class="sales-row-call">Call</a>' : '';
      html +=
        '<div class="sales-row">' +
        '<span class="sales-row-name">' + _esc(r.name || r.cardcode || '—') + '</span>' +
        phone +
        '</div>';
    }
    el.innerHTML = html;
  }

  function _renderAtRisk(el, atRisk) {
    if (!el) return;
    var list = (atRisk || []).slice(0, 5);
    if (!list.length) {
      el.innerHTML = '<div class="sales-card-empty">All BPs ordered in last 14 days.</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var tier = r.tier || 'slowing';
      var label = r.days_since_last_order == null
        ? 'no orders yet'
        : r.days_since_last_order + 'd';
      html +=
        '<div class="sales-row">' +
        '<span class="sales-row-name">' + _esc(r.name || r.cardcode || '—') + '</span>' +
        '<span class="sales-tier sales-tier-' + _esc(tier) + '">' + _esc(label) + '</span>' +
        '</div>';
    }
    el.innerHTML = html;
  }

  async function _loadAndRender(period) {
    var container = document.getElementById('sales-sap-summary');
    if (!container) return;

    if (!navigator.onLine) {
      container.innerHTML =
        '<div class="sales-sap-error" role="alert"><p>You appear offline. Connect and tap Retry.</p>' +
        '<button type="button" class="sales-sap-retry">Retry</button></div>';
      var b = container.querySelector('.sales-sap-retry');
      if (b) b.addEventListener('click', function () { _lastKey = ''; refreshSalesTab(period); });
      return;
    }

    var key = period;
    var now = Date.now();
    if (key === _lastKey && (now - _lastAt) < CACHE_MS && _lastData) {
      _render(container, _lastData, period);
      return;
    }

    _showLoading(container);

    var url = '/api/sap/sales?period=' + encodeURIComponent(period);
    var data;
    try {
      data = await sapFetch(url);
    } catch (e) {
      _showError(container, period, { message: (e && e.message) || String(e) });
      return;
    }

    if (!data || data.error) {
      if (data && data.status === 401) {
        window.location.href = 'index.html';
        return;
      }
      _showError(container, period, data || { error: 'Unknown error' });
      return;
    }

    _lastKey = key;
    _lastAt = now;
    _lastData = data;
    _render(container, data, period);
  }

  function _syncPeriodButtons(period) {
    var row = document.querySelector('.sales-period-row');
    if (!row) return;
    var btns = row.querySelectorAll('.sales-period-btn');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var p = (b.getAttribute('data-period') || '').toUpperCase();
      var on = p === period.toUpperCase();
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }

  function _bindPeriodRowOnce() {
    if (_periodBound) return;
    var row = document.querySelector('.sales-period-row');
    if (!row) return;
    _periodBound = true;
    row.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var btn = t.closest('.sales-period-btn');
      if (!btn || !row.contains(btn)) return;
      var p = (btn.getAttribute('data-period') || 'MTD').toUpperCase();
      refreshSalesTab(p);
    });
  }

  function _syncUnitButtons(unit) {
    var row = document.querySelector('.sales-unit-row');
    if (!row) return;
    var btns = row.querySelectorAll('.sales-unit-btn');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var u = (b.getAttribute('data-unit') || '').toUpperCase();
      var on = u === unit.toUpperCase();
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }

  function _bindUnitRowOnce() {
    if (_unitBound) return;
    var row = document.querySelector('.sales-unit-row');
    if (!row) return;
    _unitBound = true;
    row.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var btn = t.closest('.sales-unit-btn');
      if (!btn || !row.contains(btn)) return;
      var u = (btn.getAttribute('data-unit') || 'BAGS').toUpperCase();
      if (u !== 'BAGS' && u !== 'MT') u = 'BAGS';
      _currentUnit = u;
      _syncUnitButtons(u);
      _updateHero();
    });
  }

  window.refreshSalesTab = function (period) {
    period = (period || 'MTD').toUpperCase();
    if (period !== 'MTD' && period !== 'YTD') period = 'MTD';
    _syncPeriodButtons(period);
    _syncUnitButtons(_currentUnit);
    _loadAndRender(period);
  };

  window.initSalesTab = function () {
    _bindPeriodRowOnce();
    _bindUnitRowOnce();
    var pRow = document.querySelector('.sales-period-row');
    var pActive = pRow && pRow.querySelector('.sales-period-btn.active');
    var period = (pActive && pActive.getAttribute('data-period')) || 'MTD';
    var uRow = document.querySelector('.sales-unit-row');
    var uActive = uRow && uRow.querySelector('.sales-unit-btn.active');
    _currentUnit = ((uActive && uActive.getAttribute('data-unit')) || 'BAGS').toUpperCase();
    refreshSalesTab(period);
  };

  // Test hooks (Node unit tests)
  if (typeof window !== 'undefined') {
    window._patrolSalesTabTestHooks = {
      fmtVolumeMt: _fmtVolumeMt,
      heroForUnit: _heroForUnit
    };
  }
})();
