// Team Module — Manager view (DSM/RSM/Exec/Admin)
// Sprint B-DSM upgrade: attention strip + KPI tiles + coaching + forecast + audit flags.
// TSR drill-down (page-tsr-scorecard) kept in place unchanged.

function _teamEsc(s) {
  if (s == null) return '';
  var d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

function _initials(name) {
  if (!name) return '?';
  var parts = name.split(/\s+/);
  var first = (parts[0] || '?').charAt(0).toUpperCase();
  var second = parts[1] ? parts[1].charAt(0).toUpperCase() : '';
  return first + second;
}

function _teamFmtInt(n) {
  return (parseFloat(n) || 0).toLocaleString('en-PH');
}

// ── Attention strip data fetchers ─────────────────────────────
async function _fetchAtRiskStores(tsrIds) {
  if (!tsrIds || tsrIds.length === 0) return [];
  // Need id, name, last_visit_at, risk_status — all in stores table.
  try {
    var res = await supabaseClient
      .from('stores')
      .select('id,name,risk_status,last_visit_at,assigned_tsr')
      .in('assigned_tsr', tsrIds)
      .eq('risk_status', 'at_risk');
    return (res && res.data) || [];
  } catch (e) {
    console.warn('_fetchAtRiskStores:', e);
    return [];
  }
}

function _daysSince(iso) {
  if (!iso) return Infinity;
  var t = new Date(iso).getTime();
  if (!t) return Infinity;
  return Math.floor((Date.now() - t) / 86400000);
}

// Build the 3 attention items. Returns HTML for the strip.
function _renderAttentionStrip(tsrs, recentVisits, atRiskStores) {
  var items = [];

  // Item 1 — Idle TSRs (0 visits in last 3 days)
  var threeDaysAgo = Date.now() - 3 * 86400000;
  var activeInLast3 = {};
  (recentVisits || []).forEach(function (v) {
    if (!v.visited_at) return;
    var t = new Date(v.visited_at).getTime();
    if (t >= threeDaysAgo && v.tsr_id) activeInLast3[v.tsr_id] = 1;
  });
  var idleTsrs = (tsrs || []).filter(function (t) { return !activeInLast3[t.id]; });
  if (idleTsrs.length > 0) {
    var firstIdle = idleTsrs[0];
    var firstName = (firstIdle.name || '').split(/\s+/)[0] || 'TSR';
    var extra = idleTsrs.length > 1 ? ' +' + (idleTsrs.length - 1) : '';
    items.push(_teamEsc(firstName) + ' \u00b7 0 visits 3 days' + extra);
  }

  // Item 2 — Critical account (top 1 at-risk + >30d no visit)
  var critical = (atRiskStores || [])
    .filter(function (s) { return _daysSince(s.last_visit_at) > 30; })
    .sort(function (a, b) { return _daysSince(b.last_visit_at) - _daysSince(a.last_visit_at); });
  if (critical.length > 0) {
    var top = critical[0];
    var days = _daysSince(top.last_visit_at);
    var daysLabel = days === Infinity ? 'walang visit record' : days + 'd walang order';
    items.push(_teamEsc(top.name || 'Store') + ' \u00b7 ' + daysLabel);
  }

  // Item 3 — At-risk count
  if (atRiskStores && atRiskStores.length > 0) {
    items.push(atRiskStores.length + ' stores at-risk');
  }

  if (items.length === 0) {
    return '<div class="alert-strip empty">' +
      '<div class="alert-icon">\u2705</div>' +
      '<div class="alert-body">' +
        '<div class="alert-title">All clear \u2014 walang urgent items today</div>' +
        '<div class="alert-list"><span class="alert-tag">Team active \u00b7 pipeline healthy</span></div>' +
      '</div>' +
    '</div>';
  }

  var tags = items.map(function (i) { return '<span class="alert-tag">' + i + '</span>'; }).join('');
  return '<div class="alert-strip">' +
    '<div class="alert-icon">\ud83d\udea8</div>' +
    '<div class="alert-body">' +
      '<div class="alert-title">' + items.length + ' item' + (items.length === 1 ? '' : 's') + ' need your attention today</div>' +
      '<div class="alert-list">' + tags + '</div>' +
    '</div>' +
  '</div>';
}

// ── KPI tiles ─────────────────────────────────────────────────
function _trendPill(dir, label) {
  // dir: 'up' | 'down' | 'flat'
  return '<div class="kpi-tile-trend ' + dir + '">' + _teamEsc(label) + '</div>';
}

function _renderKpiTiles(agg, kpis, tsrs, storesTotal) {
  var tsrCount = (tsrs && tsrs.length) || (agg && agg.tsr_count) || 0;
  var activeToday = (kpis && kpis.active_tsrs) || 0;

  // Idle TSRs subtitle (first idle name)
  var idleLabel = '';
  if (tsrs && tsrs.length) {
    var idleNames = tsrs.filter(function (t) {
      return !agg.tsr_scorecards.some(function (sc) {
        // Treat TSR as "active this period" if they had any visit MTD.
        return sc.tsr_id === t.id && sc.retention.visited_count > 0;
      });
    }).map(function (t) { return (t.name || '').split(/\s+/)[0]; });
    if (idleNames.length) idleLabel = ' \u00b7 ' + _teamEsc(idleNames[0]) + ' idle';
  }

  // Stores Visited coverage — from scorecards
  var visitedSum = 0, activeSum = 0;
  (agg.tsr_scorecards || []).forEach(function (sc) {
    visitedSum += sc.retention.visited_count || 0;
    activeSum += sc.retention.total_active || 0;
  });
  var coveragePct = activeSum > 0 ? Math.round((visitedSum / activeSum) * 100) : 0;

  // Volume MTD
  var volMtd = agg.total_mt || 0;
  var growthPct = agg.avg_growth_pct || 0;
  var volTrendDir = growthPct > 1 ? 'up' : growthPct < -1 ? 'down' : 'flat';
  var volTrendLabel = (growthPct >= 0 ? '\u2191' : '\u2193') + Math.abs(growthPct) + '%';
  if (volTrendDir === 'flat') volTrendLabel = '\u2014';

  // Conversions
  var conv = agg.total_conversions || 0;
  var convTrendDir = conv >= 3 ? 'up' : 'flat';
  var convTrendLabel = conv >= 3 ? '\u2191' + conv : '\u2014';

  // Active TSRs trend — up if activeToday >= tsrCount - 1, flat otherwise
  var actTrendDir = tsrCount > 0 && activeToday >= tsrCount - 1 ? 'up' : activeToday === 0 ? 'down' : 'flat';
  var actTrendLabel = actTrendDir === 'up' ? '\u2191' : actTrendDir === 'down' ? '\u2193' : '\u2014';

  // Stores Visited trend
  var covTrendDir = coveragePct >= 60 ? 'up' : coveragePct < 30 ? 'down' : 'flat';
  var covTrendLabel = coveragePct >= 60 ? '\u2191' + coveragePct + '%' : covTrendDir === 'down' ? '\u2193' + coveragePct + '%' : '\u2014';

  var denomStores = storesTotal || activeSum;

  return '<div class="kpi-tile-grid">' +
    '<div class="kpi-tile">' +
      '<div class="kpi-tile-label">\ud83d\udcca Active TSRs</div>' +
      _trendPill(actTrendDir, actTrendLabel) +
      '<div class="kpi-tile-value">' + activeToday + '/' + tsrCount + '</div>' +
      '<div class="kpi-tile-sub">' + (tsrCount > 0 ? Math.round(activeToday / tsrCount * 100) : 0) + '% today' + idleLabel + '</div>' +
    '</div>' +
    '<div class="kpi-tile">' +
      '<div class="kpi-tile-label">\ud83c\udfea Stores Visited</div>' +
      _trendPill(covTrendDir, covTrendLabel) +
      '<div class="kpi-tile-value">' + visitedSum + '/' + denomStores + '</div>' +
      '<div class="kpi-tile-sub">' + coveragePct + '% coverage MTD</div>' +
    '</div>' +
    '<div class="kpi-tile">' +
      '<div class="kpi-tile-label">\ud83c\udfaf Conversions</div>' +
      _trendPill(convTrendDir, convTrendLabel) +
      '<div class="kpi-tile-value">' + conv + '</div>' +
      '<div class="kpi-tile-sub">' + (agg.total_new_stores || 0) + ' bagong prospects</div>' +
    '</div>' +
    '<div class="kpi-tile">' +
      '<div class="kpi-tile-label">\ud83d\udcc8 Volume MTD</div>' +
      _trendPill(volTrendDir, volTrendLabel) +
      '<div class="kpi-tile-value">' + _teamFmtInt(Math.round(volMtd)) + ' MT</div>' +
      '<div class="kpi-tile-sub">vs 450 MT target</div>' +
    '</div>' +
  '</div>';
}

// ── Leaderboard (elite table style) ───────────────────────────
function _renderLeaderboard(agg) {
  var tsrs = agg.tsr_scorecards || [];
  var head =
    '<div class="dsm-table-card">' +
      '<div class="dsm-table-card-hdr">' +
        '<div class="dsm-table-card-title">\ud83c\udfc6 TSR Performance</div>' +
        '<div style="font-size:11px;color:var(--text-secondary);font-weight:700">MTD</div>' +
      '</div>' +
      '<div class="dsm-lb-row dsm-lb-head">' +
        '<div>TSR</div>' +
        '<div class="dsm-lb-num">ACTIVE</div>' +
        '<div class="dsm-lb-num dsm-lb-hide-mobile">PROSP</div>' +
        '<div class="dsm-lb-num">CONV</div>' +
        '<div class="dsm-lb-num">SCORE</div>' +
      '</div>';

  var rows = '';
  tsrs.forEach(function (t) {
    var medal = t.rank === 1 ? '\ud83e\udd47 ' :
                t.rank === 2 ? '\ud83e\udd48 ' :
                t.rank === 3 ? '\ud83e\udd49 ' : '';
    var vp = t.retention.visited_pct || 0;
    var dot = vp >= 85 ? 'dot-green' : vp >= 65 ? 'dot-yellow' : 'dot-red';
    var scoreDir = t.overall >= 3.5 ? 'trend-up' : t.overall < 2 ? 'trend-down' : 'trend-flat';
    var convCell = t.conversion.converted > 0
      ? t.conversion.converted + (t.conversion.converted >= 3 ? ' \ud83d\udd25' : '')
      : '0 \ud83d\udd3b';

    rows += '<div class="dsm-lb-row" onclick="openTsrScorecard(\'' + _teamEsc(t.tsr_id) + '\')">' +
      '<div class="dsm-lb-name">' + medal + _teamEsc(t.tsr_name || 'TSR') + '</div>' +
      '<div class="dsm-lb-num"><span class="score-dot ' + dot + '"></span>' + vp + '%</div>' +
      '<div class="dsm-lb-num dsm-lb-hide-mobile">' + (t.prospection.new_stores || 0) + '</div>' +
      '<div class="dsm-lb-num">' + convCell + '</div>' +
      '<div class="dsm-lb-num"><b>' + t.overall + '</b> <span class="trend-arrow ' + scoreDir + '">' +
        (scoreDir === 'trend-up' ? '\u2197' : scoreDir === 'trend-down' ? '\u2198' : '\u2014') +
      '</span></div>' +
    '</div>';
  });

  return head + rows + '</div>';
}

// ── RSM Team view ─────────────────────────────────────────────
// Direct reports for an RSM are DSMs, not TSRs. Treating them with the
// DSM leaderboard layout (per-TSR columns, coaching, forecast) is wrong —
// RSM needs DSM-level aggregates. This branch runs instead of the DSM
// renderer when session.role === 'rsm'.
async function _renderRsmTeam(session) {
  var panel = document.getElementById('dsm-panel-root');
  var subtitle = document.getElementById('team-subtitle');
  if (!panel) return;

  if (subtitle) subtitle.textContent = 'RSM \u00b7 ' + (session.region || 'Region');

  panel.innerHTML =
    '<div class="alert-strip" style="background:white;border:1px solid rgba(8,132,255,0.22);border-top:4px solid var(--fb-blue)">' +
      '<div class="alert-icon">\u23f3</div>' +
      '<div class="alert-body"><div class="alert-title" style="color:var(--fb-blue)">Loading region\u2026</div></div>' +
    '</div>';

  try {
    var dsmsRes = await supabaseClient
      .from('users')
      .select('id,name,role,region,district,territory')
      .eq('manager_id', session.id)
      .eq('role', 'dsm')
      .eq('is_active', true);
    var dsms = (dsmsRes && dsmsRes.data) || [];

    if (dsms.length === 0) {
      panel.innerHTML =
        '<div style="text-align:center;padding:60px 24px;background:white;border-radius:12px">' +
          '<div style="font-size:48px;margin-bottom:16px">\ud83c\udfaf</div>' +
          '<div style="font-size:15px;color:var(--text-secondary);line-height:1.5">' +
            'No DSMs under this RSM yet. Assign DSMs (set <code>manager_id</code> on DSM users to this RSM\u2019s id).' +
          '</div>' +
        '</div>';
      return;
    }

    // Compute scorecards in parallel — each DSM's aggregate pulls its TSRs.
    var dsmScorecards = await Promise.all(dsms.map(async function (d) {
      var sc = null;
      try { sc = await calculateDsmScorecard(d.id); } catch (e) { console.warn('calculateDsmScorecard', d.id, e); }
      var empty = !sc || sc.empty;
      return {
        dsm_id: d.id,
        name: d.name || 'DSM',
        district: d.district || d.territory || d.region || 'Unassigned',
        active_tsrs:   empty ? 0 : (sc.tsr_scorecards ? sc.tsr_scorecards.length : 0),
        total_conversions: empty ? 0 : (sc.total_conversions || 0),
        total_new_stores:  empty ? 0 : (sc.total_new_stores  || 0),
        retention_rate:    empty ? 0 : (sc.avg_retention_rate || 0),
        prospection_stars: empty ? 0 : (sc.prospection_stars || 0),
        conversion_stars:  empty ? 0 : (sc.conversion_stars  || 0),
        retention_stars:   empty ? 0 : (sc.retention_stars   || 0),
        growth_stars:      empty ? 0 : (sc.growth_stars      || 0),
        overall_stars:     empty ? 0 : (sc.overall_stars     || 0),
        overall_score:     empty ? 0 : (sc.avg_overall_score || 0),
        empty: empty
      };
    }));

    dsmScorecards.sort(function (a, b) { return b.overall_score - a.overall_score; });
    dsmScorecards.forEach(function (d, i) { d.rank = i + 1; });

    // Roll-up KPIs
    var totalTsrs = 0, totalConv = 0, totalNew = 0, scoreSum = 0, retSum = 0, retN = 0;
    dsmScorecards.forEach(function (d) {
      totalTsrs += d.active_tsrs;
      totalConv += d.total_conversions;
      totalNew  += d.total_new_stores;
      scoreSum  += d.overall_score;
      if (!d.empty) { retSum += d.retention_rate; retN++; }
    });
    var avgScore = dsmScorecards.length > 0 ? Math.round((scoreSum / dsmScorecards.length) * 10) / 10 : 0;
    var avgRet   = retN > 0 ? Math.round(retSum / retN) : 0;

    var kpiHtml =
      '<div class="kpi-tile-grid">' +
        '<div class="kpi-tile">' +
          '<div class="kpi-tile-label">\ud83c\udfaf DSMs</div>' +
          '<div class="kpi-tile-value">' + dsms.length + '</div>' +
          '<div class="kpi-tile-sub">' + totalTsrs + ' TSRs total</div>' +
        '</div>' +
        '<div class="kpi-tile">' +
          '<div class="kpi-tile-label">\ud83d\udd0d New Prospects</div>' +
          '<div class="kpi-tile-value">' + totalNew + '</div>' +
          '<div class="kpi-tile-sub">region-wide MTD</div>' +
        '</div>' +
        '<div class="kpi-tile">' +
          '<div class="kpi-tile-label">\ud83c\udfc6 Conversions</div>' +
          '<div class="kpi-tile-value">' + totalConv + '</div>' +
          '<div class="kpi-tile-sub">region-wide MTD</div>' +
        '</div>' +
        '<div class="kpi-tile">' +
          '<div class="kpi-tile-label">\u2b50 Avg DSM Score</div>' +
          '<div class="kpi-tile-value">' + avgScore + '</div>' +
          '<div class="kpi-tile-sub">' + avgRet + '% avg coverage</div>' +
        '</div>' +
      '</div>';

    // DSM performance leaderboard
    var head =
      '<div class="dsm-table-card">' +
        '<div class="dsm-table-card-hdr">' +
          '<div class="dsm-table-card-title">\ud83c\udfc6 DSM Performance</div>' +
          '<div style="font-size:11px;color:var(--text-secondary);font-weight:700">MTD</div>' +
        '</div>' +
        '<div class="dsm-lb-row dsm-lb-head">' +
          '<div>DSM</div>' +
          '<div class="dsm-lb-num">TSRs</div>' +
          '<div class="dsm-lb-num dsm-lb-hide-mobile">CONV</div>' +
          '<div class="dsm-lb-num">COVERAGE</div>' +
          '<div class="dsm-lb-num">SCORE</div>' +
        '</div>';

    var rows = '';
    dsmScorecards.forEach(function (d) {
      var medal = d.rank === 1 ? '\ud83e\udd47 ' :
                  d.rank === 2 ? '\ud83e\udd48 ' :
                  d.rank === 3 ? '\ud83e\udd49 ' : '';
      var dot = d.retention_rate >= 85 ? 'dot-green' : d.retention_rate >= 65 ? 'dot-yellow' : 'dot-red';
      var arrow = d.overall_score >= 3.5 ? 'trend-up' : d.overall_score < 2 ? 'trend-down' : 'trend-flat';
      var convCell = d.total_conversions > 0
        ? d.total_conversions + (d.total_conversions >= 3 ? ' \ud83d\udd25' : '')
        : '0 \ud83d\udd3b';
      var label = _teamEsc(d.name) + ' \u00b7 ' + _teamEsc(d.district);
      rows += '<div class="dsm-lb-row">' +
        '<div class="dsm-lb-name">' + medal + label + '</div>' +
        '<div class="dsm-lb-num">' + d.active_tsrs + '</div>' +
        '<div class="dsm-lb-num dsm-lb-hide-mobile">' + convCell + '</div>' +
        '<div class="dsm-lb-num"><span class="score-dot ' + dot + '"></span>' + Math.round(d.retention_rate) + '%</div>' +
        '<div class="dsm-lb-num"><b>' + d.overall_score + '</b> <span class="trend-arrow ' + arrow + '">' +
          (arrow === 'trend-up' ? '\u2197' : arrow === 'trend-down' ? '\u2198' : '\u2014') +
        '</span></div>' +
      '</div>';
    });

    panel.innerHTML = kpiHtml + head + rows + '</div>';
  } catch (err) {
    console.warn('_renderRsmTeam:', err);
    panel.innerHTML =
      '<div style="padding:24px;color:var(--sync-error);text-align:center;background:white;border-radius:12px">' +
        (T.loadError || 'Hindi ma-load.') +
        '<br><small style="opacity:0.7">' + _teamEsc(err.message || err) + '</small>' +
      '</div>';
  }
}

// ── Main render ───────────────────────────────────────────────
async function renderTeamPage() {
  var session = getSession();
  if (!session) return;

  // RSM needs a completely different leaderboard (DSMs, not TSRs).
  if ((session.role || '').toLowerCase() === 'rsm') {
    return _renderRsmTeam(session);
  }

  var panel = document.getElementById('dsm-panel-root');
  var subtitle = document.getElementById('team-subtitle');
  if (!panel) return;

  if (subtitle) subtitle.textContent = (session.role || '').toUpperCase() +
    (session.region ? ' \u00b7 ' + session.region : '');

  panel.innerHTML =
    '<div class="alert-strip" style="background:white;border:1px solid rgba(8,132,255,0.22);border-top:4px solid var(--fb-blue)">' +
      '<div class="alert-icon">\u23f3</div>' +
      '<div class="alert-body"><div class="alert-title" style="color:var(--fb-blue)">Loading team data\u2026</div></div>' +
    '</div>';

  try {
    // Step 1: who's on the team?
    var tsrsRes = await supabaseClient
      .from('users')
      .select('id,name,role')
      .eq('manager_id', session.id)
      .eq('is_active', true);
    var tsrs = (tsrsRes && tsrsRes.data) || [];
    var tsrIds = tsrs.map(function (t) { return t.id; });
    var tsrNameById = {};
    tsrs.forEach(function (t) { tsrNameById[t.id] = t.name; });

    if (tsrIds.length === 0) {
      panel.innerHTML =
        '<div style="text-align:center;padding:60px 24px;background:white;border-radius:12px">' +
          '<div style="font-size:48px;margin-bottom:16px">\ud83d\udc65</div>' +
          '<div style="font-size:15px;color:var(--text-secondary);line-height:1.5">' +
            (T.noTeamYet || 'Walang team member pa. Makipag-ugnayan sa admin.') +
          '</div>' +
        '</div>';
      return;
    }

    // Step 2: parallel-fetch everything else we need for the panel.
    // calculateDsmScorecard issues its own query set — we'd refactor that into a single RPC in a Sprint B perf pass (see H-02).
    var aggP      = calculateDsmScorecard(session.id);
    var kpisP     = (typeof getTeamKPIs === 'function') ? getTeamKPIs(session.id, session.role) : Promise.resolve({ active_tsrs: 0 });
    var auditP    = (typeof fetchAuditData === 'function') ? fetchAuditData(tsrIds) : Promise.resolve({ visits: [] });
    var atRiskP   = _fetchAtRiskStores(tsrIds);
    var allStoresP = supabaseClient.from('stores').select('id,name', { count: 'exact', head: false }).in('assigned_tsr', tsrIds);

    var results = await Promise.all([aggP, kpisP, auditP, atRiskP, allStoresP]);
    var agg       = results[0];
    var kpis      = results[1] || {};
    var auditData = results[2] || { visits: [] };
    var atRisk    = results[3] || [];
    var storesRes = results[4] || {};
    var storeList = (storesRes && storesRes.data) || [];
    var storesTotal = storeList.length;

    var storeNameById = {};
    storeList.forEach(function (s) { storeNameById[s.id] = s.name; });

    if (!agg || agg.empty) {
      panel.innerHTML =
        '<div style="text-align:center;padding:60px 24px;background:white;border-radius:12px">' +
          '<div style="font-size:48px;margin-bottom:16px">\ud83d\udcca</div>' +
          '<div style="font-size:15px;color:var(--text-secondary);line-height:1.5">Walang scorecard data pa para sa team.</div>' +
        '</div>';
      return;
    }

    // Step 3: audit flags — compute from visits and map by TSR for coaching hookup.
    var auditFlags = (typeof detectAuditFlags === 'function')
      ? detectAuditFlags(auditData.visits || [], tsrNameById, storeNameById)
      : [];
    var flagsByTsr = (typeof flagsByTsrId === 'function') ? flagsByTsrId(auditFlags) : {};

    // Step 4: render sections.
    var attentionHtml = _renderAttentionStrip(tsrs, auditData.visits || [], atRisk);
    var kpiHtml       = _renderKpiTiles(agg, kpis, tsrs, storesTotal);
    var lbHtml        = _renderLeaderboard(agg);
    var coachingHtml  = (typeof generateCoachingCards === 'function')
      ? generateCoachingCards(agg, flagsByTsr)
      : '<div class="coaching-empty">Coaching module not loaded.</div>';
    var forecastHtml  = (typeof renderDsmForecastCard === 'function')
      ? renderDsmForecastCard(agg)
      : '<div class="forecast-card">Forecast module not loaded.</div>';
    var auditHtml     = (typeof renderAuditFlags === 'function')
      ? renderAuditFlags(auditFlags)
      : '<div class="audit-flag-clean">Audit module not loaded.</div>';

    panel.innerHTML =
      attentionHtml +
      kpiHtml +
      '<div class="dsm-two-col">' +
        '<div>' + lbHtml + '</div>' +
        '<div>' +
          '<div class="dsm-small-title">\ud83c\udfaf Coaching moments (auto-generated)</div>' +
          coachingHtml +
        '</div>' +
      '</div>' +
      '<div class="dsm-two-col">' +
        forecastHtml +
        '<div>' +
          '<div class="dsm-small-title">\ud83d\udd0d Audit flags (AI-detected)</div>' +
          auditHtml +
        '</div>' +
      '</div>';
  } catch (err) {
    console.warn('renderTeamPage:', err);
    panel.innerHTML =
      '<div style="padding:24px;color:var(--sync-error);text-align:center;background:white;border-radius:12px">' +
        (T.loadError || 'Hindi ma-load.') +
        '<br><small style="opacity:0.7">' + _teamEsc(err.message || err) + '</small>' +
      '</div>';
  }
}

// ── TSR drill-down (unchanged from pre-sprint) ────────────────
async function openTsrScorecard(tsrId) {
  window._selectedTsrId = tsrId;
  if (typeof nav === 'function') nav('page-tsr-scorecard');
  renderTsrScorecardDetail(tsrId);
}

async function renderTsrScorecardDetail(tsrId) {
  var contentEl = document.getElementById('tsc-content');
  if (contentEl) contentEl.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-secondary)">' + (T.loading || 'Loading...') + '</div>';

  var tsrRes = await supabaseClient
    .from('users')
    .select('id,name,role,region,district,phone')
    .eq('id', tsrId)
    .single();
  var tsr = tsrRes && tsrRes.data;
  if (!tsr) return;

  var sc = await calculateTsrScorecard(tsrId);

  var visitsRes = await supabaseClient
    .from('visits')
    .select('id,order_taken,order_amount,visited_at,notes,stores(name)')
    .eq('tsr_id', tsrId)
    .order('visited_at', { ascending: false })
    .limit(10);
  var visits = (visitsRes && visitsRes.data) || [];

  var initials = _initials(tsr.name);
  var av = document.getElementById('tsc-avatar');
  if (av) {
    av.style.background = getGradient(tsr.id);
    av.textContent = initials;
  }
  var nameEl = document.getElementById('tsc-name');
  if (nameEl) nameEl.textContent = tsr.name;
  var roleEl = document.getElementById('tsc-role');
  if (roleEl) roleEl.textContent = (tsr.role || '').toUpperCase() + ' \u00b7 ' + (tsr.district || tsr.region || '');

  var html =
    '<div class="tsc-scorecard">' +
      '<div class="tsc-overall">' +
        '<div class="tsc-score">' + sc.overall + '</div>' +
        '<div class="tsc-stars-big">' + renderStars(sc.overall_stars) + '</div>' +
        '<div class="tsc-label">' + (T.overallScore || 'Overall Score') + '</div>' +
      '</div>' +
      '<div class="tsc-stages">' +
        _stage('\ud83d\udd0d', T.prospection || 'Prospection', sc.prospection.stars, [
          [T.newStores || 'Bagong tindahan', sc.prospection.new_stores],
          [T.activeProspects || 'Aktibong prospect', sc.prospection.prospects_count]
        ]) +
        _stage('\ud83c\udfaf', T.conversion || 'Conversion', sc.conversion.stars, [
          [T.converted || 'Converted', sc.conversion.converted],
          [T.conversionRate || 'Conversion rate', sc.conversion.rate + '%']
        ]) +
        _stage('\u2764', T.retention || 'Retention', sc.retention.stars, [
          [T.visited || 'Visited', sc.retention.visited_count + '/' + sc.retention.total_active + ' (' + sc.retention.visited_pct + '%)'],
          [T.atRisk || 'At risk', '<span style="color:#F7B928">' + sc.retention.at_risk + '</span>'],
          [T.churned || 'Churned', '<span style="color:#FA383E">' + sc.retention.churned + '</span>']
        ]) +
        _stage('\ud83d\udcc8', T.growth || 'Growth', sc.growth.stars, [
          [T.mtdVolume || 'MTD Volume', sc.growth.mtd_mt + ' MT'],
          [T.growthPct || 'Growth vs LM', '<span style="color:' + (sc.growth.growth_pct >= 0 ? '#31A24C' : '#FA383E') + '">' + (sc.growth.growth_pct >= 0 ? '+' : '') + sc.growth.growth_pct + '%</span>'],
          [T.avgSov || 'Avg SOV', sc.growth.avg_sov + '%']
        ]) +
      '</div>' +
      '<div class="section-hdr">\ud83d\udcdd ' + (T.recentVisits || 'Mga huling bisita') + '</div>' +
      '<div class="tsc-visits">' + _renderVisitList(visits) + '</div>' +
    '</div>';

  if (contentEl) contentEl.innerHTML = html;
}

function _stage(icon, title, stars, metrics) {
  var rows = '';
  for (var i = 0; i < metrics.length; i++) {
    rows += '<div class="tsc-metric-row"><span>' + metrics[i][0] + '</span><b>' + metrics[i][1] + '</b></div>';
  }
  return '<div class="tsc-stage">' +
    '<div class="tsc-stage-head">' +
      '<span class="tsc-stage-icon">' + icon + '</span>' +
      '<span class="tsc-stage-title">' + title + '</span>' +
      '<span class="tsc-stage-stars">' + renderStars(stars) + '</span>' +
    '</div>' +
    '<div class="tsc-stage-metrics">' + rows + '</div>' +
  '</div>';
}

function _renderVisitList(visits) {
  if (!visits || visits.length === 0) {
    return '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">' +
      (T.noVisitsYet || 'Walang naka-record na bisita') + '</div>';
  }
  var out = '';
  for (var i = 0; i < visits.length; i++) {
    var v = visits[i];
    var storeName = (v.stores && v.stores.name) || 'Unknown store';
    var outcome = v.order_taken
      ? '\ud83d\uded2 ' + (T.ordered || 'Nag-order') + ' \u00b7 \u20b1' + (parseFloat(v.order_amount) || 0).toLocaleString()
      : '\ud83d\udcac ' + (T.noOrderNote || 'Walang order');
    var time = v.visited_at ? new Date(v.visited_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '';
    out += '<div class="visit-row">' +
      '<div class="visit-row-body">' +
        '<div class="visit-row-store">' + _teamEsc(storeName) + '</div>' +
        '<div class="visit-row-outcome">' + outcome + '</div>' +
      '</div>' +
      '<div class="visit-row-time">' + time + '</div>' +
    '</div>';
  }
  return out;
}

window.renderTeamPage = renderTeamPage;
window.renderTsrScorecardDetail = renderTsrScorecardDetail;
window.openTsrScorecard = openTsrScorecard;
