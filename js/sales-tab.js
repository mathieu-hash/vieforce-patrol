// Sales tab — live SAP summary via Patrol /api/sap/sales (HQ /api/sales proxy).

(function () {
  'use strict';

  var CACHE_MS = 28000;
  var _lastKey = '';
  var _lastAt = 0;
  var _lastData = null;     // HQ /api/sap/sales response (hero, scope, freshness)
  var _lastDirect = null;   // Direct SAP /api/sap/sales/all response
  /** TODO: replace MOCK_VELOCITY with /api/sales/velocity daily series when available */
  var MOCK_VELOCITY = [40, 55, 48, 62, 58, 70, 68, 78, 72, 85, 82, 90, 95];
  var _periodBound = false;
  var _unitBound = false;
  var _expandBound = false;
  var _salesV2NavBound = false;
  var _onlineListenersBound = false;
  var _currentUnit = 'BAGS'; // 'BAGS' | 'MT'

  function _activePeriod() {
    var pRow = document.querySelector('.sales-period-row');
    var pActive = pRow && pRow.querySelector('.sales-period-btn.active');
    return ((pActive && pActive.getAttribute('data-period')) || 'MTD').toUpperCase();
  }

  function _bindExpandOnce() {
    if (_expandBound) return;
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var btn = t.closest('[data-sales-see-all]');
      if (btn) {
        console.log('TODO: expand sales section —', btn.getAttribute('data-sales-see-all'));
        return;
      }
      var btn2 = t.closest('.sales-expand-btn');
      if (!btn2) return;
      var card = btn2.closest('.sales-card-d');
      if (card) card.classList.toggle('expanded');
    });
    _expandBound = true;
  }

  function _mtdDaysApprox() {
    var now = new Date();
    return Math.max(1, now.getDate());
  }

  function _ytdDaysApprox() {
    var now = new Date();
    var start = new Date(now.getFullYear(), 0, 1);
    return Math.max(1, Math.round((now - start) / 86400000) + 1);
  }

  function customersAtRisk() {
    return (_lastDirect && _lastDirect.at_risk) ? _lastDirect.at_risk : [];
  }

  function _updateAtRiskStrip(direct) {
    var card = document.getElementById('atRiskCard');
    var title = document.getElementById('atRiskTitle');
    if (!card || !title) return;
    var list = (direct && direct.at_risk) ? direct.at_risk : [];
    var n = list.length;
    if (n <= 0) {
      card.style.display = 'none';
      card.onclick = null;
      return;
    }
    card.style.display = 'flex';
    title.textContent = n + ' customer' + (n === 1 ? '' : 's') + ' slowing down';
    card.onclick = function () {
      console.log('TODO: filter to at-risk');
    };
  }

  function renderVelocityBars(dailyData) {
    var bars = document.getElementById('velocityBars');
    if (!bars) return;
    if (!dailyData || !dailyData.length) {
      bars.innerHTML = '';
      return;
    }
    var max = Math.max.apply(
      null,
      dailyData.map(function (d) {
        return d.bags;
      })
    );
    if (!isFinite(max) || max <= 0) max = 1;
    bars.innerHTML = dailyData.map(function (d, i) {
      var h = (d.bags / max) * 100;
      var isPeak = i === dailyData.length - 1;
      var title =
        (d.date != null ? String(d.date) : 'Day ' + (i + 1)) + ': ' + _fmtIntish(d.bags);
      return (
        '<div class="velocity-bar' + (isPeak ? ' peak' : '') + '" style="height:' + h + '%;" title="' +
        _attrEsc(title) +
        '"></div>'
      );
    }).join('');
  }

  function _paintVelocity(hqData, direct, period) {
    var foot = document.getElementById('velocityValue');
    var deltaEl = document.getElementById('velocityDelta');
    if (!foot) return;

    var bags = direct && direct.kpis && direct.kpis.bags != null ? Number(direct.kpis.bags) : null;
    var days = period === 'YTD' ? _ytdDaysApprox() : _mtdDaysApprox();
    if (bags == null || isNaN(bags)) {
      foot.textContent = '';
      if (deltaEl) deltaEl.textContent = '';
      renderVelocityBars([]);
      return;
    }
    var bpd = bags / days;
    foot.textContent = _fmtIntish(Math.round(bpd)) + ' bags/day';

    var k = (hqData && hqData.kpis) || {};
    var mom = _momPctFromKpis(k);
    if (deltaEl) {
      if (mom != null && !isNaN(mom)) {
        var r = Math.round(mom);
        deltaEl.style.color = r >= 0 ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)';
        deltaEl.textContent =
          (r >= 0 ? '\u25b2 ' : '\u25bc ') + Math.abs(r) + '%';
      } else {
        deltaEl.textContent = '';
      }
    }

    var series = null;
    if (direct && direct.velocity_daily && direct.velocity_daily.length) {
      series = direct.velocity_daily;
    }
    var allowMockVelocity =
      typeof patrolFeatureEnabled !== 'function' || patrolFeatureEnabled('salesVelocityChart');
    if (!series || !series.length) {
      if (allowMockVelocity) {
        series = MOCK_VELOCITY.map(function (bags, idx) {
          return { bags: bags, date: 'Day ' + (idx + 1) };
        });
      } else {
        series = [];
      }
    }
    renderVelocityBars(series);
  }

  function _esc(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  /** Safe single-quoted attribute value for title=. */
  function _attrEsc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/'/g, '&#39;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  /**
   * SAP often returns ALL CAPS product lines — sentence-case for readability on narrow screens.
   * Full string stays on title= tooltip after truncation.
   */
  function _humanizeSapLabel(str) {
    if (str == null) return '';
    var t = String(str).trim();
    if (!t) return '';
    var letters = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
    if (!letters.length) return t;
    var up = 0;
    var i;
    for (i = 0; i < letters.length; i++) {
      var ch = letters.charAt(i);
      if (ch >= 'A' && ch <= 'Z') up++;
    }
    if (up / letters.length < 0.58) return t;
    var lower = t.toLowerCase();
    return lower.replace(/\b([a-zÀ-ÿ])/g, function (m) {
      return m.toUpperCase();
    });
  }

  /** Ellipsis-truncate — full text preserved via title tooltip. */
  function _truncateDisplayLabel(str, maxLen) {
    maxLen = maxLen || 28;
    if (str == null) return '';
    var s = _humanizeSapLabel(str);
    if (s.length <= maxLen) return s;
    return s.slice(0, Math.max(0, maxLen - 1)) + '\u2026';
  }

  /** Overlay KPI fields from /api/sap/sales/all (same HQ payload, richer than first paint). */
  function _mergeCompareKpisFromDirect(direct) {
    if (!_lastData || !direct || !direct.kpis) return;
    var src = direct.kpis;
    var dst = _lastData.kpis = _lastData.kpis || {};
    var k;
    for (k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      if (k === 'volume_bags') continue;
      dst[k] = src[k];
    }
    if (src.bags != null) dst.bags = src.bags;
  }

  function _momPctFromKpis(k) {
    if (!k || typeof k !== 'object') return null;
    var v =
      k.volume_mom_pct != null ? Number(k.volume_mom_pct)
        : k.vs_last_month_pct != null ? Number(k.vs_last_month_pct)
          : k.bags_mom_pct != null ? Number(k.bags_mom_pct)
            : k.volume_chg_pct != null ? Number(k.volume_chg_pct)
              : k.vol_mom_pct != null ? Number(k.vol_mom_pct)
                : NaN;
    return isNaN(v) ? null : v;
  }

  function _paintHeroMeta(hqData, period) {
    var lm = document.getElementById('heroPillLm');
    var tg = document.getElementById('heroPillTarget');
    var rg = document.getElementById('heroPillRegion');
    var label = document.getElementById('salesHeroLabel');
    var unit = (_currentUnit || 'BAGS').toUpperCase();
    var unitWord = unit === 'MT' ? 'MT' : 'bags';
    var pr = (period || 'MTD').toUpperCase();
    if (label) {
      label.textContent = 'Total ' + unitWord + ' \u00b7 ' + pr;
    }

    var k = (hqData && hqData.kpis) || {};
    var subLm = document.getElementById('salesV2MomSub');
    if (lm) {
      var pctLm = _momPctFromKpis(k);
      if (pctLm != null && !isNaN(pctLm)) {
        var r = Math.round(pctLm);
        lm.style.display = '';
        lm.className = 'hero-kpi-pill' + (r >= 0 ? ' up' : ' down');
        var numPart =
          r === 0 ? '0%'
            : r > 0 ? '+' + Math.abs(r) + '%'
              : '\u2212' + Math.abs(r) + '%';
        lm.textContent = (r >= 0 ? '\u25b2 ' : '\u25bc ') + numPart;
        if (subLm) {
          subLm.style.display = '';
          subLm.textContent = 'vs last month';
          subLm.classList.toggle('mom-neg', r < 0);
        }
      } else {
        lm.style.display = 'none';
        if (subLm) subLm.style.display = 'none';
      }
    } else if (subLm) {
      subLm.style.display = 'none';
    }
    if (tg) {
      var pct =
        k.progress_pct != null ? Number(k.progress_pct)
          : k.pct_to_target != null ? Number(k.pct_to_target)
            : k.target_pct != null ? Number(k.target_pct)
              : NaN;
      if (!isNaN(pct)) {
        tg.style.display = '';
        tg.textContent = Math.round(pct) + '% of target';
      } else {
        tg.style.display = 'none';
      }
    }
    if (rg) {
      var rk = k.region_rank != null ? Number(k.region_rank) : NaN;
      if (!isNaN(rk) && rk > 0 && rk <= 3) {
        rg.style.display = '';
        rg.textContent = 'Top ' + rk + ' region';
      } else {
        rg.style.display = 'none';
      }
    }
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

  function _initialsFromName(name) {
    if (!name) return '—';
    var parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '—';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function _paintOnlineIndicator() {
    var dot = document.getElementById('salesV2OnlineDot');
    var lbl = document.getElementById('salesV2OnlineLbl');
    var on = typeof navigator !== 'undefined' && navigator.onLine;
    if (dot) dot.classList.toggle('off', !on);
    if (lbl) lbl.textContent = on ? 'Online' : 'Offline';
  }

  function _bindOnlineListenersOnce() {
    if (_onlineListenersBound) return;
    _onlineListenersBound = true;
    window.addEventListener('online', _paintOnlineIndicator);
    window.addEventListener('offline', _paintOnlineIndicator);
  }

  function _bindSalesV2NavOnce() {
    if (_salesV2NavBound) return;
    var root = document.getElementById('pg-sales');
    if (!root) return;
    _salesV2NavBound = true;
    root.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest('#salesV2OpenHq')) {
        ev.preventDefault();
        try {
          window.open('https://hq.vienovo.ph', '_blank', 'noopener,noreferrer');
        } catch (_e) {}
        return;
      }
      if (t.closest('#salesInsightsSeeAll')) {
        ev.preventDefault();
        if (typeof window.nav === 'function') window.nav('page-stores');
        return;
      }
      if (t.closest('#salesInsightWhitespace') || t.closest('#salesInsightAtRisk')) {
        ev.preventDefault();
        if (typeof window.nav === 'function') window.nav('page-stores');
        return;
      }
      var mod = t.closest('[data-sales-nav]');
      if (mod && typeof window.nav === 'function') {
        ev.preventDefault();
        var pid = mod.getAttribute('data-sales-nav');
        if (pid) window.nav(pid);
      }
    });
  }

  /** Header row: session + optional HQ scope name (refines after first SAP response). */
  function _paintSalesChrome(hqData) {
    var session = typeof getSession === 'function' ? getSession() : null;
    var scopeObj = {};
    if (hqData && hqData.patrol_meta && hqData.patrol_meta.hq_scope) {
      scopeObj = hqData.patrol_meta.hq_scope;
    }
    var scopeLabel =
      scopeObj.name || scopeObj.scope_name || scopeObj.territory || scopeObj.label || '';
    var sub =
      (scopeLabel && String(scopeLabel).trim()) ||
      (session && (session.territory || session.district || session.region)) ||
      'Your territory';
    var pillRaw =
      (session && (session.territory || session.district)) ||
      (scopeLabel && String(scopeLabel).trim()) ||
      sub;
    var subEl = document.getElementById('salesV2ScopeSubtitle');
    if (subEl) subEl.textContent = sub;
    var pillEl = document.getElementById('salesV2TerritoryPill');
    if (pillEl) {
      var pr = String(pillRaw || '').trim() || sub;
      pillEl.textContent = pr.length > 18 ? pr.slice(0, 17) + '\u2026' : pr;
    }
    var name = (session && session.name) ? String(session.name) : '\u2014';
    var nameEl = document.getElementById('salesV2UserName');
    if (nameEl) nameEl.textContent = name;
    var role = session && session.role ? String(session.role).toUpperCase() : '';
    var reg = session && session.region ? ' \u00b7 ' + session.region : '';
    var metaEl = document.getElementById('salesV2UserMeta');
    if (metaEl) metaEl.textContent = (role + reg).trim();
    var av = document.getElementById('salesV2UserAv');
    if (av) av.textContent = _initialsFromName(name);
  }

  function _paintQuickInsights(direct) {
    var nWs = document.getElementById('salesWsCount');
    var nAr = document.getElementById('salesArCount');
    if (!direct) {
      if (nWs) nWs.textContent = '\u2014';
      if (nAr) nAr.textContent = '\u2014';
      return;
    }
    var wsList = direct.whitespace ? direct.whitespace : [];
    var arList = direct.at_risk ? direct.at_risk : [];
    if (nWs) nWs.textContent = _fmtIntish(wsList.length);
    if (nAr) nAr.textContent = _fmtIntish(arList.length);
    var sWs = document.getElementById('salesWsSub');
    var sAr = document.getElementById('salesArSub');
    if (sWs) {
      sWs.textContent =
        wsList.length === 1 ? 'store with 0 bags (MTD)' : 'stores with 0 bags (MTD)';
    }
    if (sAr) {
      sAr.textContent =
        arList.length === 1 ? 'account needs attention' : 'accounts need attention';
    }
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
      '<div class="app-content sales-v2-container">' +
      '<div class="sales-v2-hero-card">' +
      '<div class="sales-v2-hero-top">' +
      '<div class="sales-v2-hero-left">' +
      '<div class="sales-v2-hero-icon">\ud83d\udce6</div>' +
      '<div class="hero-kpi-content">' +
      '<div class="hero-kpi-label" id="salesHeroLabel">Total bags \u00b7 MTD</div>' +
      '<div class="hero-kpi-value num" id="salesHeroValue"><span class="sales-hero-skeleton" aria-label="Loading">\u2026</span></div>' +
      '</div></div>' +
      '<div class="sales-v2-hero-right">' +
      '<span class="hero-kpi-pill up" id="heroPillLm" style="display:none"></span>' +
      '<div class="sales-v2-mom-sub" id="salesV2MomSub" style="display:none">vs last month</div>' +
      '</div></div>' +
      '<div class="velocity-card">' +
      '<div style="display:flex;justify-content:flex-end;margin-bottom:2px;">' +
      '<div style="font-size:12px;font-weight:700;" id="velocityDelta"></div></div>' +
      '<div class="velocity-bars" id="velocityBars"></div>' +
      '<div class="sales-v2-vel-foot"><span>Earlier</span><strong class="num" id="velocityValue"></strong><span>Latest</span></div>' +
      '</div>' +
      '<div class="sales-v2-hero-foot">' +
      '<span class="hero-kpi-pill" id="heroPillTarget" style="display:none"></span>' +
      '<span class="hero-kpi-pill gold" id="heroPillRegion" style="display:none"></span>' +
      '</div></div>' +
      '<div class="sales-v2-section">' +
      '<div class="sales-v2-section-hdr"><span>QUICK INSIGHTS</span>' +
      '<button type="button" class="sales-v2-seeall" id="salesInsightsSeeAll">See all</button></div>' +
      '<div class="sales-v2-insights-grid">' +
      '<button type="button" class="sales-v2-insight" id="salesInsightWhitespace">' +
      '<div class="sales-v2-insight-h"><span>\ud83d\udcc8</span> Whitespace</div>' +
      '<div class="sales-v2-insight-num" id="salesWsCount">\u2014</div>' +
      '<div class="sales-v2-insight-sub" id="salesWsSub">stores with 0 bags (MTD)</div></button>' +
      '<button type="button" class="sales-v2-insight" id="salesInsightAtRisk">' +
      '<div class="sales-v2-insight-h"><span>\u26a0\ufe0f</span> At risk</div>' +
      '<div class="sales-v2-insight-num" id="salesArCount">\u2014</div>' +
      '<div class="sales-v2-insight-sub" id="salesArSub">accounts need attention</div></button>' +
      '</div></div>' +
      '<div class="sales-v2-section"><div class="sales-v2-section-hdr"><span>BREAKDOWN</span></div>' +
      '<div class="sales-v2-card" id="brandsCard"><div class="sales-v2-card-h">' +
      '<div class="sales-v2-card-title"><span>\ud83c\udff7\ufe0f</span> By brand</div>' +
      '<span class="sales-v2-card-tag">Top 5</span></div>' +
      '<div id="brandBars"><div style="color:var(--text-secondary);font-size:13px;">Loading\u2026</div></div></div>' +
      '<div class="sales-v2-card" id="customersCard"><div class="sales-v2-card-h">' +
      '<div class="sales-v2-card-title"><span>\ud83d\udc65</span> By customer</div>' +
      '<span class="sales-v2-card-tag">Top 5</span></div>' +
      '<div id="customerRows"><div style="color:var(--text-secondary);font-size:13px;">Loading\u2026</div></div></div></div>' +
      '<div class="sales-v2-section"><div class="sales-v2-section-hdr"><span>MORE MODULES</span></div>' +
      '<button type="button" class="sales-v2-module" data-sales-nav="pg-ar">' +
      '<div class="sales-v2-mod-ico" style="background:rgba(244,63,94,0.12);">\ud83d\udcb0</div>' +
      '<div class="sales-v2-mod-body"><div class="sales-v2-mod-title">AR overview</div>' +
      '<div class="sales-v2-mod-sub">Aging &amp; collections</div></div><span class="sales-v2-mod-chev">\u203a</span></button>' +
      '<button type="button" class="sales-v2-module" data-sales-nav="pg-budget">' +
      '<div class="sales-v2-mod-ico" style="background:rgba(139,92,246,0.12);">\ud83c\udfaf</div>' +
      '<div class="sales-v2-mod-body"><div class="sales-v2-mod-title">Budget &amp; targets</div>' +
      '<div class="sales-v2-mod-sub">Goals &amp; pacing</div></div><span class="sales-v2-mod-chev">\u203a</span></button>' +
      '<button type="button" class="sales-v2-module" data-sales-nav="pg-insights">' +
      '<div class="sales-v2-mod-ico" style="background:rgba(14,165,233,0.12);">\ud83d\udca1</div>' +
      '<div class="sales-v2-mod-body"><div class="sales-v2-mod-title">Customer insights</div>' +
      '<div class="sales-v2-mod-sub">Opportunities</div></div><span class="sales-v2-mod-chev">\u203a</span></button>' +
      '<button type="button" class="sales-v2-module" data-sales-nav="pg-inventory">' +
      '<div class="sales-v2-mod-ico" style="background:rgba(245,158,11,0.12);">\ud83d\udce6</div>' +
      '<div class="sales-v2-mod-body"><div class="sales-v2-mod-title">Inventory</div>' +
      '<div class="sales-v2-mod-sub">Stock signals</div></div><span class="sales-v2-mod-chev">\u203a</span></button></div>' +
      '<div class="sales-v2-hq-cta">' +
      '<button type="button" id="salesV2OpenHq">Open full dashboard in VieForce HQ <span aria-hidden="true">\u2197</span></button>' +
      '<div class="sales-v2-hq-hint">Desktop experience \u00b7 Full analytics</div></div>' +
      '<p style="text-align:center;color:var(--text-secondary);font-size:13px;padding:8px 0 0">Loading sales\u2026</p>' +
      '</div>';
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
    _updateFreshness('error');
    _paintOnlineIndicator();
  }

  function _render(container, data, period) {
    var pm = data.patrol_meta || {};
    var scope = pm.hq_scope || data.scope || {};
    var isEmpty = !!(pm.is_empty || scope.is_empty);

    if (isEmpty) {
      container.innerHTML =
        '<div class="sales-sap-empty" role="status">' +
        '<p><strong>No SAP territory mapped for this login.</strong></p>' +
        '<p class="sales-sap-empty-hint">HQ needs at least one of: your <code>sap_slpcode</code> (from OSLP), ' +
        '<code>sap_district_code</code> (if you use district scope), or your TSRs&rsquo; <code>sap_slpcode</code> ' +
        'with <code>manager_id</code> set to you. Ask an admin to fix <code>public.users</code> in Supabase, then pull to refresh.</p>' +
        '<p class="sales-sap-empty-hint" style="margin-top:10px;font-size:12px;">If you see errors instead of this message, check Vercel env ' +
        '<code>HQ_SERVICE_TOKEN</code> (must match HQ Cloud Run) and <code>SUPABASE_SERVICE_ROLE_KEY</code>.</p></div>';
      return;
    }

    var hero = _heroForUnit(_currentUnit, data, _lastDirect);
    var heroValueHtml = hero.loading
      ? '<span class="sales-hero-skeleton" aria-label="Loading">\u2026</span>'
      : hero.formatted;

    container.innerHTML =
      '<div class="app-content sales-v2-container">' +
      '<div class="sales-v2-hero-card">' +
      '<div class="sales-v2-hero-top">' +
      '<div class="sales-v2-hero-left">' +
      '<div class="sales-v2-hero-icon">\ud83d\udce6</div>' +
      '<div class="hero-kpi-content">' +
      '<div class="hero-kpi-label" id="salesHeroLabel"></div>' +
      '<div class="hero-kpi-value num" id="salesHeroValue">' + heroValueHtml + '</div>' +
      '</div></div>' +
      '<div class="sales-v2-hero-right">' +
      '<span class="hero-kpi-pill up" id="heroPillLm" style="display:none"></span>' +
      '<div class="sales-v2-mom-sub" id="salesV2MomSub" style="display:none">vs last month</div>' +
      '</div></div>' +
      '<div class="velocity-card">' +
      '<div style="display:flex;justify-content:flex-end;margin-bottom:2px;">' +
      '<div style="font-size:12px;font-weight:700;font-family:Manrope,sans-serif;" id="velocityDelta"></div></div>' +
      '<div class="velocity-bars" id="velocityBars"></div>' +
      '<div class="sales-v2-vel-foot"><span>Earlier</span><strong class="num" id="velocityValue"></strong><span>Latest</span></div>' +
      '</div>' +
      '<div class="sales-v2-hero-foot">' +
      '<span class="hero-kpi-pill" id="heroPillTarget" style="display:none"></span>' +
      '<span class="hero-kpi-pill gold" id="heroPillRegion" style="display:none"></span>' +
      '</div></div>' +
      '<div class="sales-v2-section">' +
      '<div class="sales-v2-section-hdr"><span>QUICK INSIGHTS</span>' +
      '<button type="button" class="sales-v2-seeall" id="salesInsightsSeeAll">See all</button></div>' +
      '<div class="sales-v2-insights-grid">' +
      '<button type="button" class="sales-v2-insight" id="salesInsightWhitespace">' +
      '<div class="sales-v2-insight-h"><span>\ud83d\udcc8</span> Whitespace</div>' +
      '<div class="sales-v2-insight-num" id="salesWsCount">\u2014</div>' +
      '<div class="sales-v2-insight-sub" id="salesWsSub">stores with 0 bags (MTD)</div></button>' +
      '<button type="button" class="sales-v2-insight" id="salesInsightAtRisk">' +
      '<div class="sales-v2-insight-h"><span>\u26a0\ufe0f</span> At risk</div>' +
      '<div class="sales-v2-insight-num" id="salesArCount">\u2014</div>' +
      '<div class="sales-v2-insight-sub" id="salesArSub">accounts need attention</div></button>' +
      '</div></div>' +
      '<div class="sales-v2-section"><div class="sales-v2-section-hdr"><span>BREAKDOWN</span></div>' +
      '<div class="sales-v2-card" id="brandsCard"><div class="sales-v2-card-h">' +
      '<div class="sales-v2-card-title"><span>\ud83c\udff7\ufe0f</span> By brand</div>' +
      '<button type="button" class="sales-see-all sales-v2-card-tag" data-sales-see-all="brand" ' +
      'style="font-size:11px;color:var(--accent);font-weight:700;background:none;border:none;cursor:pointer;padding:0;">See all \u203a</button></div>' +
      '<div id="brandBars"><div style="color:var(--text-secondary);font-size:13px;">Loading\u2026</div></div></div>' +
      '<div class="sales-v2-card" id="customersCard"><div class="sales-v2-card-h">' +
      '<div class="sales-v2-card-title"><span>\ud83d\udc65</span> By customer</div>' +
      '<button type="button" class="sales-see-all sales-v2-card-tag" data-sales-see-all="customers" ' +
      'style="font-size:11px;color:var(--accent);font-weight:700;background:none;border:none;cursor:pointer;padding:0;">See all \u203a</button></div>' +
      '<div id="customerRows"><div style="color:var(--text-secondary);font-size:13px;">Loading\u2026</div></div></div></div>' +
      '<div class="sales-v2-section"><div class="sales-v2-section-hdr"><span>MORE MODULES</span></div>' +
      '<button type="button" class="sales-v2-module" data-sales-nav="pg-ar">' +
      '<div class="sales-v2-mod-ico" style="background:rgba(244,63,94,0.12);">\ud83d\udcb0</div>' +
      '<div class="sales-v2-mod-body"><div class="sales-v2-mod-title">AR overview</div>' +
      '<div class="sales-v2-mod-sub">Aging &amp; collections</div></div><span class="sales-v2-mod-chev">\u203a</span></button>' +
      '<button type="button" class="sales-v2-module" data-sales-nav="pg-budget">' +
      '<div class="sales-v2-mod-ico" style="background:rgba(139,92,246,0.12);">\ud83c\udfaf</div>' +
      '<div class="sales-v2-mod-body"><div class="sales-v2-mod-title">Budget &amp; targets</div>' +
      '<div class="sales-v2-mod-sub">Goals &amp; pacing</div></div><span class="sales-v2-mod-chev">\u203a</span></button>' +
      '<button type="button" class="sales-v2-module" data-sales-nav="pg-insights">' +
      '<div class="sales-v2-mod-ico" style="background:rgba(14,165,233,0.12);">\ud83d\udca1</div>' +
      '<div class="sales-v2-mod-body"><div class="sales-v2-mod-title">Customer insights</div>' +
      '<div class="sales-v2-mod-sub">Opportunities</div></div><span class="sales-v2-mod-chev">\u203a</span></button>' +
      '<button type="button" class="sales-v2-module" data-sales-nav="pg-inventory">' +
      '<div class="sales-v2-mod-ico" style="background:rgba(245,158,11,0.12);">\ud83d\udce6</div>' +
      '<div class="sales-v2-mod-body"><div class="sales-v2-mod-title">Inventory</div>' +
      '<div class="sales-v2-mod-sub">Stock signals</div></div><span class="sales-v2-mod-chev">\u203a</span></button></div>' +
      '<div class="sales-v2-hq-cta">' +
      '<button type="button" id="salesV2OpenHq">Open full dashboard in VieForce HQ <span aria-hidden="true">\u2197</span></button>' +
      '<div class="sales-v2-hq-hint">Desktop experience \u00b7 Full analytics</div></div>' +
      '</div>';

    _paintHeroMeta(data, period);
    _paintSalesChrome(data);

    if (_lastDirect) {
      _renderDirectCards(_lastDirect);
      _paintVelocity(data, _lastDirect, period);
      _updateFreshness('ok');
    } else {
      _updateFreshness('loading');
      _paintQuickInsights(null);
      renderVelocityBars([]);
    }
    _loadAllDirectSap(period);
  }

  function _updateHero() {
    if (!_lastData) return;
    var el = document.getElementById('salesHeroValue');
    if (!el) return;
    var hero = _heroForUnit(_currentUnit, _lastData, _lastDirect);
    if (hero.loading) {
      el.innerHTML = '<span class="sales-hero-skeleton" aria-label="Loading">\u2026</span>';
    } else {
      el.textContent = hero.formatted;
    }
    _paintHeroMeta(_lastData, _activePeriod());
  }

  function _updateFreshness(state) {
    var syncTxt = document.getElementById('salesV2SyncText');
    if (state === 'loading') {
      if (syncTxt) syncTxt.textContent = 'Syncing SAP\u2026';
    } else if (state === 'error') {
      if (syncTxt) syncTxt.textContent = 'SAP unavailable';
    } else if (state === 'ok' && _lastDirect) {
      var iso = (_lastDirect.patrol_meta && _lastDirect.patrol_meta.fetched_at) ||
        (_lastData && _lastData.patrol_meta && _lastData.patrol_meta.fetched_at);
      var label = _formatFreshness(iso);
      if (syncTxt) {
        syncTxt.textContent = label ? ('SAP synced ' + label) : 'SAP data loaded';
      }
    } else if (state === 'ok') {
      if (syncTxt) syncTxt.textContent = 'SAP live';
    } else {
      if (syncTxt) syncTxt.textContent = 'Sales';
    }
  }

  /** Single round-trip: by_brand + by_customer + whitespace + at_risk in parallel server-side.
   *  Has a 18s client-side timeout so a hung Vercel/SAP doesn't leave cards "Loading…" forever.
   */
  async function _loadAllDirectSap(period) {
    var brEl = document.getElementById('brandBars');
    var byEl = document.getElementById('customerRows');

    var url = '/api/sap/sales/all?period=' + encodeURIComponent(period);
    var session = (typeof getSession === 'function') ? getSession() : null;
    if (!session || !session.id) {
      _spreadError([brEl, byEl], { message: 'Session missing. Sign in again.' });
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
        [brEl, byEl],
        data || { error: 'SAP server unreachable. Try again.' }
      );
      _injectDirectRetry(period, data && data.message);
      _updateFreshness('error');
      return;
    }

    _lastDirect = data;
    try {
      window._patrolSalesDirectSnapshot = data;
    } catch (_snap) {}
    _mergeCompareKpisFromDirect(data);
    _updateHero();
    _renderDirectCards(data);
    _updateAtRiskStrip(data);
    _paintVelocity(_lastData, data, period);
    _updateFreshness('ok');
  }

  function _spreadError(els, errObj) {
    for (var i = 0; i < els.length; i++) _renderEmptyOrError(els[i], errObj);
  }

  function _injectDirectRetry(period, message) {
    var existing = document.getElementById('sales-direct-retry');
    if (existing) existing.parentNode.removeChild(existing);
    var anchor = document.getElementById('brandsCard');
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
    _renderByBrand(document.getElementById('brandBars'), data.by_brand || []);
    _renderByCustomer(document.getElementById('customerRows'), data.by_customer || []);
    _paintQuickInsights(data);
  }

  function _renderByBrand(el, brands) {
    if (!el) return;
    var rawList = brands || [];
    var list = rawList.slice(0, 5);
    var seeBtn = document.querySelector('#brandsCard .sales-see-all');
    if (seeBtn) {
      seeBtn.textContent =
        rawList.length > 0 ? ('See all ' + rawList.length + ' \u203a') : 'See all \u203a';
    }
    if (!list.length) {
      el.innerHTML = '<div class="sales-card-empty">No brand breakdown for this period.</div>';
      return;
    }
    var total = 0;
    for (var t = 0; t < list.length; t++) total += parseFloat(list[t].bags) || 0;
    if (total <= 0) total = 0;

    var top = list.slice(0, 3);
    var colors = [
      'linear-gradient(90deg, #2D7FF9, #4595FF)',
      'linear-gradient(90deg, #97D700, #00B847)',
      'linear-gradient(90deg, #FFC72C, #FA9E1B)',
      'linear-gradient(90deg, #F33E58, #FA6E32)',
      'linear-gradient(90deg, #6A52E5, #8B6FFF)'
    ];

    var html = '';
    var i;
    for (i = 0; i < top.length; i++) {
      var r = top[i];
      var rawName = (r && r.name) || '(no brand)';
      var disp = _truncateDisplayLabel(rawName, 28);
      var bags = parseFloat(r && r.bags) || 0;
      var pct = total > 0 ? Math.round((bags / total) * 100) : 0;
      html +=
        '<div class="brand-bar-row">' +
        '<div class="brand-bar-head">' +
        '<span style="color:var(--text-primary);font-weight:600;">' + _esc(disp) + '</span>' +
        '<span style="color:var(--text-primary);font-weight:800;font-family:Manrope,sans-serif;" class="num">' +
        _fmtIntish(bags) +
        '</span>' +
        '</div>' +
        '<div class="brand-bar-track">' +
        '<div class="brand-bar-fill" style="background:' + colors[i % colors.length] + ';width:' + pct + '%;"></div>' +
        '</div>' +
        '</div>';
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
    var list = (byCustomer || []).slice(0, 3);
    if (!list.length) {
      el.innerHTML = '<div class="sales-card-empty">No invoiced customers in this period.</div>';
      return;
    }

    var cols = ['#004D71', '#00A6CE', '#6A52E5'];
    var html = '';
    var i;
    for (i = 0; i < list.length; i++) {
      var r = list[i];
      var rawName = r.name || r.cardcode || '\u2014';
      var disp = _truncateDisplayLabel(rawName, 28);
      var bags = parseFloat(r && r.bags) || 0;
      var initials = String(disp).trim().slice(0, 2).toUpperCase();
      html +=
        '<div class="customer-row-p3">' +
        '<div class="cr-av num" style="background:' + cols[i % cols.length] + '">' +
        _esc(initials) +
        '</div>' +
        '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:700;font-size:14px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' +
        _attrEsc(rawName) +
        '">' +
        _esc(disp) +
        '</div>' +
        '<div style="font-size:12px;color:var(--text-secondary);font-weight:500;">Bags (period)</div>' +
        '</div>' +
        '<div class="cr-meta">' + _fmtIntish(bags) + '</div>' +
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
      _updateFreshness('error');
      _paintOnlineIndicator();
      return;
    }

    var key = period;
    var now = Date.now();
    if (key === _lastKey && (now - _lastAt) < CACHE_MS && _lastData) {
      _render(container, _lastData, period);
      return;
    }

    _showLoading(container);
    _updateFreshness('loading');
    _paintOnlineIndicator();

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

  window.customersAtRisk = customersAtRisk;

  window.refreshSalesTab = function (period) {
    period = (period || 'MTD').toUpperCase();
    if (period !== 'MTD' && period !== 'YTD') period = 'MTD';
    _syncPeriodButtons(period);
    _syncUnitButtons(_currentUnit);
    _loadAndRender(period);
  };

  window.initSalesTab = function () {
    _bindExpandOnce();
    _bindPeriodRowOnce();
    _bindUnitRowOnce();
    _bindSalesV2NavOnce();
    _bindOnlineListenersOnce();
    _paintSalesChrome(_lastData);
    _paintOnlineIndicator();
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
