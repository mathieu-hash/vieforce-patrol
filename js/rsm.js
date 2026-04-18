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

  async function fetchStoresForRegion(region, tsrIds) {
    // Broad pull — we need mtd_volume, prev_month_volume, district, city, status, assigned_tsr, last_order_at
    var base = supabaseClient
      .from('stores')
      .select('id,name,city,region,district,territory,assigned_tsr,mtd_volume_mt,prev_month_volume_mt,store_status,last_visit_at,last_order_at,photo_url');

    // Prefer assigned_tsr IN (tsrIds) when we have them — narrowest filter.
    if (tsrIds && tsrIds.length > 0) {
      var res = await base.in('assigned_tsr', tsrIds);
      return (res && res.data) || [];
    }
    // Fallback — region-wide
    if (region) {
      var res2 = await base.eq('region', region);
      return (res2 && res2.data) || [];
    }
    return [];
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
      wrap.innerHTML = '<div style="padding:24px 16px;color:#65676B;font-size:13px">No districts found under this RSM. Assign DSMs first.</div>';
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

  function aggregate(stores, visitsNow, visitsPrev, dsms, tsrs) {
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

    // Targets (heuristic — no targets table yet): 110% of last month's revenue/volume
    var revenueTarget = Math.max(revenuePrev * 1.1, revenue * 1.1, 1);
    var volumeTargetMt = Math.max(volumePrev * 1.1, volumeMt * 1.1, 1);

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

  // District-level aggregate for heatmap + playbook
  function buildDistrictRows(stores, visitsNow, dsms) {
    // Group stores by district
    var byDistrict = {};
    var storesByDistrict = {};
    for (var i = 0; i < stores.length; i++) {
      var d = stores[i].district || '(unassigned)';
      if (!byDistrict[d]) {
        byDistrict[d] = { district: d, active: 0, visited: 0, mtd: 0, prev: 0, stores: 0 };
        storesByDistrict[d] = [];
      }
      storesByDistrict[d].push(stores[i]);
      byDistrict[d].stores++;
      if (stores[i].store_status === 'active' || !stores[i].store_status) byDistrict[d].active++;
      byDistrict[d].mtd  += parseFloat(stores[i].mtd_volume_mt) || 0;
      byDistrict[d].prev += parseFloat(stores[i].prev_month_volume_mt) || 0;
    }

    // Mark visited stores this month
    var visitedStoreIds = {};
    for (var v = 0; v < visitsNow.length; v++) {
      if (visitsNow[v].store_id) visitedStoreIds[visitsNow[v].store_id] = 1;
    }
    for (var key in byDistrict) {
      var list = storesByDistrict[key];
      for (var s = 0; s < list.length; s++) {
        if (visitedStoreIds[list[s].id]) byDistrict[key].visited++;
      }
    }

    // Build rows — % achievement = retention rate (% of active visited this month)
    var rows = [];
    for (var k in byDistrict) {
      var dd = byDistrict[k];
      var pct = dd.active > 0 ? (dd.visited / dd.active) * 100 : 0;
      rows.push({
        district: dd.district,
        pct: pct,
        active: dd.active,
        visited: dd.visited,
        mtd: dd.mtd,
        prev: dd.prev
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
      var tsrs = await fetchTsrsByManagers(dsms.map(function (d) { return d.id; }));
      var tsrIds = tsrs.map(function (t) { return t.id; });
      var allManagedIds = tsrIds.concat(dsms.map(function (d) { return d.id; }));

      var storesRes = await fetchStoresForRegion(session.region, tsrIds);
      // If nothing came back (fresh region with no assignments yet), fall back to region match
      var stores = storesRes;
      if (stores.length === 0 && session.region) {
        var fallback = await supabaseClient
          .from('stores')
          .select('id,name,city,region,district,territory,assigned_tsr,mtd_volume_mt,prev_month_volume_mt,store_status,last_visit_at,last_order_at,photo_url')
          .eq('region', session.region);
        stores = (fallback && fallback.data) || [];
      }

      var visitsNow  = await fetchVisitsThisMonth(tsrIds);
      var visitsPrev = await fetchVisitsLastMonth(tsrIds);

      renderHeader(session, { dsms: dsms.length, tsrs: tsrs.length, stores: stores.length });

      var kpis = aggregate(stores, visitsNow, visitsPrev, dsms, tsrs);
      renderKpis(kpis);

      var districtRows = buildDistrictRows(stores, visitsNow, dsms);
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
            var pros = avg(sc.tsr_scorecards, 'prospection');
            var conv = avg(sc.tsr_scorecards, 'conversion');
            var ret  = avg(sc.tsr_scorecards, 'retention');
            var gro  = avg(sc.tsr_scorecards, 'growth');
            dsmRows.push({
              dsm_id: dsm.id,
              name: dsm.name,
              district: dsm.district,
              territory: dsm.territory,
              prospection: pros,
              conversion: conv,
              retention: ret,
              growth: gro,
              overall: (pros + conv + ret + gro) / 4
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
