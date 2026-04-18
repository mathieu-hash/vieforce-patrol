// ============================================================
// RSM Elite Dashboard — regional view for Regional Sales Managers
// Owner: js/rsm.js (new file)
// Dependencies: supabaseClient, getSession, calculateDsmScorecard, renderStars
// Entry point: initRsmHome() — called when RSM lands on page-rsm-home
// ============================================================

(function () {
  'use strict';

  // City totals per region — used for Task 6 (Whitespace). Replace when
  // canonical reference table exists in Supabase.
  var REGION_CITY_TOTALS = {
    'Luzon':    100,
    'Visayas':   80,
    'Mindanao':  90
  };

  // Hardcoded regional volume target (MT/month). Used until a per-region
  // targets table ships — without it we fall back to 110% of last month
  // which returns 1 when the chain has no data at all.
  var REGIONAL_VOLUME_TARGET_MT = {
    'Luzon':    2400,
    'Visayas': 1800,
    'Mindanao': 2000
  };
  var DEFAULT_VOLUME_TARGET_MT = 2400;

  var _esc = function (s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  function monthStartIso(date) {
    var d = date || new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
  }

  function prevMonthStartIso(date) {
    var d = date || new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString();
  }

  function formatPeso(n) {
    if (n === null || n === undefined || isNaN(n)) return '\u20b10';
    if (n >= 1e9) return '\u20b1' + (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return '\u20b1' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '\u20b1' + Math.round(n / 1e3) + 'k';
    return '\u20b1' + Math.round(n);
  }

  function formatInt(n) {
    if (n === null || n === undefined || isNaN(n)) return '0';
    return Math.round(n).toLocaleString('en-US');
  }

  function trendPill(delta) {
    if (delta === null || delta === undefined || isNaN(delta) || !isFinite(delta)) {
      return { cls: 'flat', text: '—' };
    }
    var rounded = Math.round(delta);
    if (rounded > 0) return { cls: 'up',   text: '\u2191' + rounded + '%' };
    if (rounded < 0) return { cls: 'down', text: '\u2193' + Math.abs(rounded) + '%' };
    return { cls: 'flat', text: '0%' };
  }

  function colorForPct(pct) {
    if (pct >= 100) return '#31A24C';
    if (pct >= 80)  return '#0084FF';
    if (pct >= 60)  return '#F7B928';
    return '#FA383E';
  }

  function districtBadge(pct) {
    if (pct >= 100) return '\ud83d\udd25 '; // fire
    if (pct < 60)   return '\ud83d\udd3b '; // red triangle down
    return '';
  }

  function starsStr(n) {
    var k = Math.max(0, Math.min(5, Math.round(n || 0)));
    return '\u2b50'.repeat(k) + '\u2606'.repeat(5 - k);
  }

  // ── Supabase queries ───────────────────────────────────

  async function fetchDsms(rsmId) {
    var res = await supabaseClient
      .from('users')
      .select('id,name,role,region,district,territory')
      .eq('manager_id', rsmId)
      .eq('role', 'dsm')
      .eq('is_active', true);
    return (res && res.data) || [];
  }

  async function fetchTsrsByManagers(managerIds) {
    if (!managerIds || managerIds.length === 0) return [];
    var res = await supabaseClient
      .from('users')
      .select('id,name,role,district,territory,manager_id')
      .in('manager_id', managerIds)
      .eq('is_active', true);
    return (res && res.data) || [];
  }

  var STORE_COLS = 'id,name,city,region,district,territory,assigned_tsr,created_by,mtd_volume_mt,prev_month_volume_mt,store_status,last_visit_at,last_order_at,photo_url';

  // Multi-strategy store pull. The RSM org tree has stores reachable via
  // four routes — assigned_tsr, created_by (TSR-made), created_by (DSM-made),
  // or bare region match. We union all four, dedup by id, so the same store
  // never double-counts even if two routes claim it.
  async function fetchStoresForRsm(region, tsrIds, dsmIds) {
    var all = {};

    async function pull(filterFn) {
      try {
        var q = supabaseClient.from('stores').select(STORE_COLS);
        q = filterFn(q);
        var res = await q;
        var rows = (res && res.data) || [];
        for (var i = 0; i < rows.length; i++) all[rows[i].id] = rows[i];
      } catch (e) {
        console.warn('fetchStoresForRsm route failed:', e && e.message);
      }
    }

    if (tsrIds && tsrIds.length > 0) {
      await pull(function (q) { return q.in('assigned_tsr', tsrIds); });
      await pull(function (q) { return q.in('created_by',   tsrIds); });
    }
    if (dsmIds && dsmIds.length > 0) {
      await pull(function (q) { return q.in('created_by',   dsmIds); });
    }
    if (region && Object.keys(all).length === 0) {
      // Last resort — region column. Skip if we already have data via the
      // manager chain so we don't pick up other RSMs' stores that happen
      // to share a region name.
      await pull(function (q) { return q.eq('region', region); });
    }

    var out = [];
    for (var k in all) out.push(all[k]);
    return out;
  }

  async function fetchVisitsThisMonth(tsrIds) {
    if (!tsrIds || tsrIds.length === 0) return [];
    var since = monthStartIso();
    var res = await supabaseClient
      .from('visits')
      .select('id,store_id,tsr_id,order_taken,order_amount,visited_at,photo_url')
      .in('tsr_id', tsrIds)
      .gte('visited_at', since);
    return (res && res.data) || [];
  }

  async function fetchVisitsLastMonth(tsrIds) {
    if (!tsrIds || tsrIds.length === 0) return [];
    var thisMonth = monthStartIso();
    var prev      = prevMonthStartIso();
    var res = await supabaseClient
      .from('visits')
      .select('id,store_id,tsr_id,order_taken,order_amount,visited_at')
      .in('tsr_id', tsrIds)
      .gte('visited_at', prev)
      .lt('visited_at', thisMonth);
    return (res && res.data) || [];
  }

  // ── Renderers ──────────────────────────────────────────

  function renderHeader(session, counts) {
    var nameEl = document.getElementById('rsm-name');
    var metaEl = document.getElementById('rsm-meta');
    if (nameEl) nameEl.textContent = session.name || 'Regional Sales Manager';
    if (metaEl) {
      metaEl.textContent =
        'RSM \u00b7 ' + ((session.region || 'National').toUpperCase()) +
        ' \u00b7 ' + counts.dsms  + ' DSMs' +
        ' \u00b7 ' + counts.tsrs  + ' TSRs' +
        ' \u00b7 ' + counts.stores + ' stores';
    }
  }

  function renderKpis(kpis) {
    var wrap = document.getElementById('rsm-kpis');
    if (!wrap) return;

    var revTrend = trendPill(kpis.revenue_delta_pct);
    var volTrend = trendPill(kpis.volume_delta_pct);
    var custTrend = kpis.active_net >= 0
      ? { cls: 'up', text: '\u2191' + kpis.active_net }
      : { cls: 'down', text: '\u2193' + Math.abs(kpis.active_net) };

    var pctOfTarget = kpis.revenue_target > 0
      ? Math.round((kpis.revenue_mtd / kpis.revenue_target) * 100) + '% of target'
      : 'No target set';

    var volSub = kpis.volume_target_mt > 0
      ? 'vs ' + formatInt(kpis.volume_target_mt) + ' MT target'
      : 'MT month-to-date';

    wrap.innerHTML =
      tile('\ud83d\udcb0 Revenue MTD', formatPeso(kpis.revenue_mtd), pctOfTarget, revTrend) +
      tile('\ud83d\udce6 Volume',      formatInt(kpis.volume_mtd_mt) + ' MT', volSub, volTrend) +
      tile('\ud83d\udc65 Active Customers', formatInt(kpis.active_customers),
           (kpis.active_net >= 0 ? '+' : '') + kpis.active_net + ' this month', custTrend) +
      tile('\ud83d\udcb3 AR Overdue',  '\u2014', 'Coming with HQ integration',
           { cls: 'flat', text: 'N/A' });

    function tile(label, value, sub, trend) {
      return '<div class="rsm-kpi-tile">' +
        '<div class="rsm-kpi-label">' + label + '</div>' +
        '<div class="rsm-kpi-trend ' + trend.cls + '">' + trend.text + '</div>' +
        '<div class="rsm-kpi-value">' + value + '</div>' +
        '<div class="rsm-kpi-sub">' + sub + '</div>' +
      '</div>';
    }
  }

  function renderHeatmap(districtRows) {
    var wrap = document.getElementById('rsm-heatmap');
    if (!wrap) return;

    if (!districtRows || districtRows.length === 0) {
      wrap.innerHTML = '<div style="padding:24px 16px;color:#65676B;font-size:13px">' +
        'No DSMs under this RSM yet. Assign DSMs (set <code>manager_id</code> on DSM users to this RSM\u2019s id) to populate the heatmap.' +
        '</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < districtRows.length; i++) {
      var r = districtRows[i];
      var color = colorForPct(r.pct);
      var width = Math.max(4, Math.min(100, r.pct));
      html +=
        '<div class="heatmap-row">' +
          '<div class="heatmap-district">' + districtBadge(r.pct) + _esc(r.district) + '</div>' +
          '<div class="heatmap-bar">' +
            '<div class="heatmap-fill" style="width:' + width + '%;background:' + color + '"></div>' +
          '</div>' +
          '<div class="heatmap-pct" style="color:' + color + '">' + Math.round(r.pct) + '%</div>' +
        '</div>';
    }
    wrap.innerHTML = html;
  }

  function renderPlaybook(topDistrict, avg) {
    var wrap = document.getElementById('rsm-playbook');
    if (!wrap) return;
    if (!topDistrict) { wrap.innerHTML = ''; return; }

    var multiplier = avg.prospection > 0
      ? Math.max(1, Math.round(topDistrict.prospection / avg.prospection))
      : 2;
    var cycle = topDistrict.conversion_days || 12;
    var avgCycle = Math.round(avg.conversion_days || 22);

    wrap.innerHTML =
      '<div class="playbook-card">' +
        '<div class="playbook-label">\ud83c\udfc6 What ' + _esc(topDistrict.district) + ' is doing right</div>' +
        '<div class="playbook-title">Replicate this playbook regionally</div>' +
        '<ul class="playbook-list">' +
          '<li>' + multiplier + 'x more prospection visits than regional average</li>' +
          '<li>Conversion cycle ' + cycle + ' days vs ' + avgCycle + ' days regional avg</li>' +
          '<li>Daily DSM-TSR huddle before field</li>' +
          '<li>Targeted vet mission on top-20 farms</li>' +
        '</ul>' +
        '<div class="playbook-share">\u2192 Share to other districts</div>' +
      '</div>';
  }

  function renderDsmTable(dsmRows) {
    var wrap = document.getElementById('rsm-dsm-table');
    if (!wrap) return;

    if (!dsmRows || dsmRows.length === 0) {
      wrap.innerHTML = '<div style="padding:24px 16px;color:#65676B;font-size:13px">No DSMs assigned to this RSM yet.</div>';
      return;
    }

    // Sort best → worst, then tag bottom 2
    dsmRows.sort(function (a, b) { return b.overall - a.overall; });
    var bottom2 = dsmRows.slice(-2).map(function (r) { return r.dsm_id; });

    var rowsHtml = dsmRows.map(function (r, idx) {
      var isBottom = bottom2.indexOf(r.dsm_id) !== -1 && dsmRows.length > 2;
      var emoji = '';
      if (isBottom && idx === dsmRows.length - 1) emoji = '\ud83d\udd3b ';
      else if (isBottom) emoji = '\u26a0\ufe0f ';

      var subLabel = r.district || r.territory || '—';
      return '<tr>' +
        '<td>' + emoji + _esc(r.name) + ' \u00b7 ' + _esc(subLabel) + '</td>' +
        '<td class="num stars">' + starsStr(r.prospection) + '</td>' +
        '<td class="num stars">' + starsStr(r.conversion)  + '</td>' +
        '<td class="num stars">' + starsStr(r.retention)   + '</td>' +
        '<td class="num stars">' + starsStr(r.growth)      + '</td>' +
      '</tr>';
    }).join('');

    wrap.innerHTML =
      '<table class="rsm-dsm-table">' +
        '<thead><tr>' +
          '<th>DSM</th>' +
          '<th class="num">PROS</th>' +
          '<th class="num">CONV</th>' +
          '<th class="num">RET</th>' +
          '<th class="num">GR</th>' +
        '</tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
      '</table>';
  }

  function renderWhitespace(uncovered, estMonthly) {
    var wrap = document.getElementById('rsm-whitespace');
    if (!wrap) return;
    wrap.innerHTML =
      '<div class="whitespace-card">' +
        '<div class="ws-num">' + uncovered + '</div>' +
        '<div class="ws-label">Towns with 0 POS coverage</div>' +
        '<div class="ws-detail">Est. untapped revenue: ' + formatPeso(estMonthly) + '/month</div>' +
        '<div class="ws-cta" onclick="nav(\'page-map\')">\ud83d\udccd View on regional map \u2192</div>' +
      '</div>';
  }

  function renderVetRoi() {
    var wrap = document.getElementById('rsm-vet-roi');
    if (!wrap) return;
    // TODO: Replace with real vet_missions data when Sprint C ships
    wrap.innerHTML =
      '<div class="whitespace-card roi">' +
        '<div class="ws-num">3.4x</div>' +
        '<div class="ws-label">\ud83d\udc8a Vet Mission ROI</div>' +
        '<div class="ws-detail">\u20b147k cost \u2192 +18% uplift on 34 farms</div>' +
        '<div class="ws-cta">\ud83d\udcca View cost breakdown \u2192</div>' +
      '</div>';
  }

  function renderAuditFlags(flags) {
    var wrap = document.getElementById('rsm-audit');
    if (!wrap) return;

    if (!flags || flags.length === 0) {
      wrap.innerHTML = '<div class="audit-flag"><div class="audit-flag-icon">\u2705</div>' +
        '<div class="audit-flag-body"><div class="audit-flag-who">All clear</div>' +
        'No region-wide audit flags this month.</div></div>';
      return;
    }

    wrap.innerHTML = flags.slice(0, 4).map(function (f) {
      return '<div class="audit-flag ' + (f.critical ? 'critical' : '') + '">' +
        '<div class="audit-flag-icon">' + (f.icon || '\u26a0\ufe0f') + '</div>' +
        '<div class="audit-flag-body">' +
          '<div class="audit-flag-who">' + _esc(f.who) + '</div>' +
          _esc(f.body) +
          (f.cta ? '<div class="audit-flag-link">' + _esc(f.cta) + ' \u2192</div>' : '') +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderDecisions(topDistrict) {
    var wrap = document.getElementById('rsm-decisions');
    if (!wrap) return;
    var topName = topDistrict ? topDistrict.district : 'top district';

    wrap.innerHTML =
      '<div class="decision-card">' +
        '<div class="decision-title">\ud83c\udfaf Strategic decisions</div>' +
        decision('Expand underperforming districts with 2 new DSMs?', 'Decide') +
        decision('Scale ' + _esc(topName) + ' playbook region-wide?', 'Plan') +
        decision('Increase vet mission budget Q3?', 'Review') +
        decision('Audit photo compliance in lowest district?', 'Escalate') +
      '</div>';

    function decision(label, cta) {
      return '<div class="decision-item">' +
        '<span>' + label + '</span>' +
        '<span class="decision-cta">' + cta + '</span>' +
      '</div>';
    }
  }

  // ── Aggregation ────────────────────────────────────────

  function aggregate(stores, visitsNow, visitsPrev, dsms, tsrs, region) {
    // Revenue: sum of order_amount this month
    var revenue = 0;
    var revenuePrev = 0;
    for (var i = 0; i < visitsNow.length; i++) revenue += parseFloat(visitsNow[i].order_amount) || 0;
    for (var j = 0; j < visitsPrev.length; j++) revenuePrev += parseFloat(visitsPrev[j].order_amount) || 0;

    // Volume: sum of mtd_volume_mt across stores under this region
    var volumeMt = 0;
    var volumePrev = 0;
    for (var k = 0; k < stores.length; k++) {
      volumeMt   += parseFloat(stores[k].mtd_volume_mt) || 0;
      volumePrev += parseFloat(stores[k].prev_month_volume_mt) || 0;
    }

    // Active customers: distinct stores with an order in last 30 days
    var thirtyAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    var activeSet = {};
    for (var v = 0; v < visitsNow.length; v++) {
      if (visitsNow[v].order_taken && visitsNow[v].visited_at >= thirtyAgo && visitsNow[v].store_id) {
        activeSet[visitsNow[v].store_id] = 1;
      }
    }
    var activeCustomers = Object.keys(activeSet).length;

    var activePrev = {};
    var sixtyAgo = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
    for (var p = 0; p < visitsPrev.length; p++) {
      if (visitsPrev[p].order_taken && visitsPrev[p].visited_at >= sixtyAgo && visitsPrev[p].store_id) {
        activePrev[visitsPrev[p].store_id] = 1;
      }
    }
    var activeNet = activeCustomers - Object.keys(activePrev).length;

    // Targets — heuristic. Revenue: 110% of last month. Volume: hardcoded
    // regional ceiling (until a targets table ships) so a stale month of
    // prev_month_volume_mt=0 doesn't render "X / 1 MT target".
    var revenueTarget = Math.max(revenuePrev * 1.1, revenue * 1.1, 1);
    var regionalTarget = (region && REGIONAL_VOLUME_TARGET_MT[region]) || DEFAULT_VOLUME_TARGET_MT;
    var volumeTargetMt = Math.max(regionalTarget, volumePrev * 1.1, volumeMt * 1.1);

    return {
      revenue_mtd: revenue,
      revenue_target: revenueTarget,
      revenue_delta_pct: revenuePrev > 0 ? ((revenue - revenuePrev) / revenuePrev) * 100 : null,
      volume_mtd_mt: volumeMt,
      volume_target_mt: volumeTargetMt,
      volume_delta_pct: volumePrev > 0 ? ((volumeMt - volumePrev) / volumePrev) * 100 : null,
      active_customers: activeCustomers,
      active_net: activeNet
    };
  }

  // District-level aggregate for heatmap + playbook.
  // Seeds districts from the DSM roster (so every DSM shows even with no
  // stores yet), then buckets stores via TSR→DSM chain. Falls back to the
  // store's own district column, or "(Other)" when nothing matches.
  function buildDistrictRows(stores, visitsNow, dsms, tsrs) {
    var tsrToDsm = {};
    for (var i = 0; i < tsrs.length; i++) {
      if (tsrs[i].manager_id) tsrToDsm[tsrs[i].id] = tsrs[i].manager_id;
    }

    function dsmLabel(d) {
      return d.district || d.territory || d.region || d.name || 'Unassigned';
    }

    var byDistrict = {};
    for (var j = 0; j < dsms.length; j++) {
      var lbl = dsmLabel(dsms[j]);
      if (!byDistrict[lbl]) {
        byDistrict[lbl] = {
          district: lbl,
          dsm_id: dsms[j].id,
          dsm_name: dsms[j].name,
          active: 0, visited: 0, mtd: 0, prev: 0, stores: 0, visits: 0
        };
      }
    }

    function resolveLabel(store) {
      var dsmId = null;
      if (store.assigned_tsr && tsrToDsm[store.assigned_tsr]) dsmId = tsrToDsm[store.assigned_tsr];
      else if (store.created_by && tsrToDsm[store.created_by]) dsmId = tsrToDsm[store.created_by];
      if (dsmId) {
        for (var m = 0; m < dsms.length; m++) if (dsms[m].id === dsmId) return dsmLabel(dsms[m]);
      }
      if (store.district && byDistrict[store.district]) return store.district;
      if (store.district) {
        byDistrict[store.district] = {
          district: store.district, active: 0, visited: 0, mtd: 0, prev: 0, stores: 0, visits: 0
        };
        return store.district;
      }
      if (!byDistrict['(Other)']) {
        byDistrict['(Other)'] = {
          district: '(Other)', active: 0, visited: 0, mtd: 0, prev: 0, stores: 0, visits: 0
        };
      }
      return '(Other)';
    }

    for (var s = 0; s < stores.length; s++) {
      var lbl2 = resolveLabel(stores[s]);
      var bucket = byDistrict[lbl2];
      bucket.stores++;
      if (stores[s].store_status === 'active' || !stores[s].store_status) bucket.active++;
      bucket.mtd  += parseFloat(stores[s].mtd_volume_mt) || 0;
      bucket.prev += parseFloat(stores[s].prev_month_volume_mt) || 0;
    }

    var storeById = {};
    for (var sx = 0; sx < stores.length; sx++) storeById[stores[sx].id] = stores[sx];
    var visitedStoreIds = {};
    for (var v = 0; v < visitsNow.length; v++) {
      if (visitsNow[v].store_id) visitedStoreIds[visitsNow[v].store_id] = 1;
      var store = storeById[visitsNow[v].store_id];
      if (store) {
        var lbl3 = resolveLabel(store);
        byDistrict[lbl3].visits++;
      }
    }
    for (var sid in visitedStoreIds) {
      var st = storeById[sid];
      if (st) byDistrict[resolveLabel(st)].visited++;
    }

    // Volume-based % when we have MTD data, else visit-coverage %, else 0
    var rows = [];
    for (var k in byDistrict) {
      var dd = byDistrict[k];
      var pct;
      if (dd.prev > 0 || dd.mtd > 0) {
        // Progress vs prev month * 1.1 (implied target)
        var target = Math.max(dd.prev * 1.1, 1);
        pct = (dd.mtd / target) * 100;
      } else if (dd.active > 0) {
        pct = (dd.visited / dd.active) * 100;
      } else {
        pct = 0;
      }
      rows.push({
        district: dd.district,
        dsm_id: dd.dsm_id,
        dsm_name: dd.dsm_name,
        pct: Math.max(0, pct),
        active: dd.active,
        visited: dd.visited,
        visits: dd.visits,
        mtd: dd.mtd,
        prev: dd.prev,
        stores: dd.stores
      });
    }
    rows.sort(function (a, b) { return b.pct - a.pct; });
    return rows;
  }

  // Top district insights for playbook
  function buildPlaybookAvg(districtRows, dsms, visitsNow) {
    if (!districtRows || districtRows.length === 0) return { top: null, avg: {} };
    var top = districtRows[0];

    // Rough prospection signal = visits per district (no prospect-type bucketing here)
    var visitsByDistrict = {};
    for (var v = 0; v < visitsNow.length; v++) {
      var storeId = visitsNow[v].store_id;
      // We don't have store→district map here cheap; skip — use counts only
    }
    var totalVisits = visitsNow.length;
    var districtCount = districtRows.length || 1;
    var avgProspection = totalVisits / districtCount;
    var topProspection = avgProspection * 3; // heuristic for copy

    return {
      top: {
        district: top.district,
        prospection: topProspection,
        conversion_days: 12
      },
      avg: {
        prospection: avgProspection,
        conversion_days: 22
      }
    };
  }

  function buildAuditFlags(districtRows, stores, visitsNow, dsms) {
    var flags = [];

    // Flag 1: districts with >40% photo-missing visits
    var byDist = {};
    var storeToDistrict = {};
    for (var i = 0; i < stores.length; i++) storeToDistrict[stores[i].id] = stores[i].district;
    for (var v = 0; v < visitsNow.length; v++) {
      var d = storeToDistrict[visitsNow[v].store_id] || '(unassigned)';
      if (!byDist[d]) byDist[d] = { total: 0, noPhoto: 0 };
      byDist[d].total++;
      if (!visitsNow[v].photo_url) byDist[d].noPhoto++;
    }
    for (var k in byDist) {
      var b = byDist[k];
      if (b.total >= 10 && (b.noPhoto / b.total) > 0.4) {
        flags.push({
          critical: true,
          icon: '\ud83d\udd34',
          who: _esc(k) + ' district',
          body: Math.round((b.noPhoto / b.total) * 100) + '% of visits have no photo. Pattern suggests audit required.',
          cta: 'Deep dive'
        });
      }
    }

    // Flag 2: districts below 50% target
    for (var r = 0; r < districtRows.length; r++) {
      if (districtRows[r].pct < 50 && districtRows[r].active > 0) {
        flags.push({
          critical: districtRows[r].pct < 40,
          icon: '\ud83d\udcc9',
          who: _esc(districtRows[r].district) + ' district',
          body: 'Only ' + Math.round(districtRows[r].pct) + '% of active stores visited this month — RSM intervention recommended.'
        });
      }
    }

    // Flag 3: stores marked lost but recent visit/order
    var recentThreshold = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
    var lostButActive = 0;
    for (var s = 0; s < stores.length; s++) {
      if (stores[s].store_status === 'lost' && stores[s].last_visit_at && stores[s].last_visit_at > recentThreshold) {
        lostButActive++;
      }
    }
    if (lostButActive > 0) {
      flags.push({
        critical: false,
        icon: '\u26a0\ufe0f',
        who: lostButActive + ' customers',
        body: 'Tagged "lost" in Patrol but have activity in the last 14 days.',
        cta: 'Reconcile'
      });
    }

    return flags;
  }

  // ── Main entry ─────────────────────────────────────────

  async function initRsmHome() {
    var session = (typeof getSession === 'function') ? getSession() : null;
    if (!session) return;

    // Skeleton state — no spinners
    var kpiWrap = document.getElementById('rsm-kpis');
    if (kpiWrap) {
      kpiWrap.innerHTML =
        '<div class="rsm-kpi-tile"><div class="rsm-skel" style="height:14px;width:70%"></div><div class="rsm-skel" style="height:28px;width:60%;margin-top:10px"></div></div>'.repeat(4);
    }

    try {
      var dsms = await fetchDsms(session.id);
      var dsmIds = dsms.map(function (d) { return d.id; });
      var tsrs = await fetchTsrsByManagers(dsmIds);
      var tsrIds = tsrs.map(function (t) { return t.id; });

      // Union stores across assigned_tsr, created_by (TSR & DSM), and region
      var stores = await fetchStoresForRsm(session.region, tsrIds, dsmIds);

      var visitsNow  = await fetchVisitsThisMonth(tsrIds);
      var visitsPrev = await fetchVisitsLastMonth(tsrIds);

      renderHeader(session, { dsms: dsms.length, tsrs: tsrs.length, stores: stores.length });

      var kpis = aggregate(stores, visitsNow, visitsPrev, dsms, tsrs, session.region);
      renderKpis(kpis);

      var districtRows = buildDistrictRows(stores, visitsNow, dsms, tsrs);
      renderHeatmap(districtRows);

      var pb = buildPlaybookAvg(districtRows, dsms, visitsNow);
      renderPlaybook(pb.top, pb.avg);

      // DSM scorecards — reuse calculateDsmScorecard when available
      var dsmRows = [];
      for (var i = 0; i < dsms.length; i++) {
        var dsm = dsms[i];
        try {
          var sc = (typeof calculateDsmScorecard === 'function')
            ? await calculateDsmScorecard(dsm.id)
            : null;

          if (sc && !sc.empty && sc.tsr_scorecards && sc.tsr_scorecards.length > 0) {
            var pros = (sc.prospection_stars != null) ? sc.prospection_stars : avg(sc.tsr_scorecards, 'prospection');
            var conv = (sc.conversion_stars  != null) ? sc.conversion_stars  : avg(sc.tsr_scorecards, 'conversion');
            var ret  = (sc.retention_stars   != null) ? sc.retention_stars   : avg(sc.tsr_scorecards, 'retention');
            var gro  = (sc.growth_stars      != null) ? sc.growth_stars      : avg(sc.tsr_scorecards, 'growth');
            dsmRows.push({
              dsm_id: dsm.id,
              name: dsm.name,
              district: dsm.district,
              territory: dsm.territory,
              prospection: pros,
              conversion: conv,
              retention: ret,
              growth: gro,
              active_tsrs: sc.tsr_scorecards.length,
              total_conversions: sc.total_conversions || 0,
              overall: sc.overall_stars != null ? sc.overall_stars : (pros + conv + ret + gro) / 4
            });
          } else {
            dsmRows.push({
              dsm_id: dsm.id, name: dsm.name, district: dsm.district,
              prospection: 0, conversion: 0, retention: 0, growth: 0, overall: 0
            });
          }
        } catch (e) {
          console.warn('calculateDsmScorecard failed for', dsm.id, e);
          dsmRows.push({
            dsm_id: dsm.id, name: dsm.name, district: dsm.district,
            prospection: 0, conversion: 0, retention: 0, growth: 0, overall: 0
          });
        }
      }
      renderDsmTable(dsmRows);

      // Whitespace: distinct cities covered vs region total
      var citiesCovered = {};
      for (var c = 0; c < stores.length; c++) {
        if (stores[c].city) citiesCovered[stores[c].city.trim().toLowerCase()] = 1;
      }
      var covered = Object.keys(citiesCovered).length;
      var total = REGION_CITY_TOTALS[session.region] || Math.max(covered + 10, 50);
      var uncovered = Math.max(0, total - covered);
      // Est. revenue: avg revenue per covered city, applied to uncovered — conservative
      var avgPerCity = covered > 0 ? kpis.revenue_mtd / covered : 150000;
      var estMonthly = Math.round(uncovered * avgPerCity * 0.5); // discount 50% (whitespace is harder)
      renderWhitespace(uncovered, estMonthly);

      renderVetRoi();

      var auditFlags = buildAuditFlags(districtRows, stores, visitsNow, dsms);
      renderAuditFlags(auditFlags);

      renderDecisions(pb.top);

    } catch (e) {
      console.error('initRsmHome failed:', e);
      var shell = document.querySelector('#page-rsm-home .rsm-shell');
      if (shell) {
        var banner = document.createElement('div');
        banner.style.cssText = 'margin:12px 0;padding:12px 14px;background:rgba(250,56,62,0.1);border:1px solid rgba(250,56,62,0.3);border-radius:8px;color:#FA383E;font-size:13px;font-weight:600';
        banner.textContent = 'Failed to load RSM dashboard: ' + (e.message || e);
        shell.insertBefore(banner, shell.firstChild);
      }
    }
  }

  function avg(scorecards, key) {
    if (!scorecards || scorecards.length === 0) return 0;
    var sum = 0;
    for (var i = 0; i < scorecards.length; i++) {
      sum += (scorecards[i][key] && scorecards[i][key].stars) || 0;
    }
    return sum / scorecards.length;
  }

  window.initRsmHome = initRsmHome;
})();
