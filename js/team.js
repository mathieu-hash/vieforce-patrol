// Team Module — Manager view (DSM/RSM/Exec/Admin) with Phase 3 scorecards
// Renders on #page-team. Drill-down renders on #page-tsr-scorecard.

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

async function renderTeamPage() {
  var session = getSession();
  if (!session) return;

  var container = document.getElementById('team-list');
  var subtitle = document.getElementById('team-subtitle');
  if (!container) return;

  container.innerHTML = '<div class="section-hdr">\u26a1 ' + (T.myTeam || 'Team ko ngayon') + '</div>' +
    '<div class="store-row conv"><div class="skeleton skeleton-circle"></div>' +
    '<div class="conv-info"><div class="skeleton skeleton-line w60"></div>' +
    '<div class="skeleton skeleton-line w40"></div></div></div>';

  if (subtitle) subtitle.textContent = (session.role || '').toUpperCase() +
    (session.region ? ' \u00b7 ' + session.region : '');

  // Top strip — today's live activity (visits/active TSRs/stores covered)
  updateTeamKpiStrip(session);

  try {
    var agg = await calculateDsmScorecard(session.id);
    if (agg.empty) {
      container.innerHTML = '<div style="text-align:center;padding:48px 24px">' +
        '<div style="font-size:48px;margin-bottom:16px">\ud83d\udc65</div>' +
        '<div style="font-size:15px;color:var(--text-secondary);line-height:1.5">' +
        (T.noTeamYet || 'Walang team member pa. Makipag-ugnayan sa admin.') +
        '</div></div>';
      _setTeamKpis(0, 0, 0);
      return;
    }

    // Rebuild the rich scorecard strip inline above the leaderboard
    var html =
      '<div class="team-scorecard-strip">' +
        _tssCard('\ud83d\udd0d', agg.total_new_stores, T.newStores || 'Bagong') +
        _tssCard('\ud83c\udfaf', agg.total_conversions, T.converted || 'Converted') +
        _tssCard('\ud83d\udc9a', agg.avg_retention_rate + '%', T.retention || 'Retention') +
        _tssCard('\ud83d\udcc8', (agg.avg_growth_pct >= 0 ? '+' : '') + agg.avg_growth_pct + '%', T.growth || 'Growth') +
      '</div>' +
      '<div class="section-hdr">\ud83c\udfc6 ' + (T.leaderboard || 'TSR Leaderboard') + '</div>';

    agg.tsr_scorecards.forEach(function (tsr) {
      var medal = tsr.rank === 1 ? '\ud83e\udd47' :
                  tsr.rank === 2 ? '\ud83e\udd48' :
                  tsr.rank === 3 ? '\ud83e\udd49' : '\u2022';
      var grad = getGradient(tsr.tsr_id);
      var initials = _initials(tsr.tsr_name);
      var summary = '\u2b50 ' + tsr.overall +
        ' \u00b7 ' + tsr.prospection.new_stores + ' new' +
        ' \u00b7 ' + tsr.conversion.converted + ' conv' +
        ' \u00b7 ' + tsr.retention.visited_pct + '% visited';

      html += '<div class="store-row conv" onclick="openTsrScorecard(\'' + _teamEsc(tsr.tsr_id) + '\')">' +
        '<div class="av-wrap">' +
          '<div class="av" style="background:' + grad + '">' +
            '<span class="av-initials" style="font-size:15px;opacity:1">' + _teamEsc(initials) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="conv-info">' +
          '<div class="conv-name">' + medal + ' ' + _teamEsc(tsr.tsr_name) + '</div>' +
          '<div class="conv-last">' + summary + '</div>' +
        '</div>' +
        '<div class="conv-meta">' +
          '<span class="conv-time">#' + tsr.rank + '</span>' +
          '<span class="ticks">\u2192</span>' +
        '</div>' +
      '</div>';
    });

    container.innerHTML = html;
  } catch (err) {
    console.warn('renderTeamPage:', err);
    container.innerHTML = '<div style="padding:20px;color:var(--sync-error);text-align:center">' +
      (T.loadError || 'Hindi ma-load.') + '<br><small>' + _teamEsc(err.message || err) + '</small></div>';
  }
}

function _setTeamKpis(visits, active, stores) {
  var v = document.getElementById('team-visits-today');
  var a = document.getElementById('team-active-tsrs');
  var s = document.getElementById('team-stores-covered');
  if (v) v.textContent = visits;
  if (a) a.textContent = active;
  if (s) s.textContent = stores;
}

async function updateTeamKpiStrip(session) {
  try {
    var kpis = await getTeamKPIs(session.id, session.role);
    _setTeamKpis(kpis.visits_today || 0, kpis.active_tsrs || 0, kpis.stores_covered || 0);
  } catch (e) { console.warn('updateTeamKpiStrip:', e); _setTeamKpis(0, 0, 0); }
}

function _tssCard(icon, value, label) {
  return '<div class="tss-card">' +
    '<div class="tss-icon">' + icon + '</div>' +
    '<div class="tss-value">' + value + '</div>' +
    '<div class="tss-label">' + label + '</div>' +
  '</div>';
}

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
        _stage('\ud83d\udc9a', T.retention || 'Retention', sc.retention.stars, [
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
