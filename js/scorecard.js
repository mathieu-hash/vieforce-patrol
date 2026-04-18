// Scorecard Module — Sprint A Phase 3
// Calculates 4-stage lifecycle scores: Prospection / Conversion / Retention / Growth
// Each stage scored 0-5 stars. Overall = average of 4.

async function calculateTsrScorecard(tsrId, month) {
  month = month || new Date().toISOString().slice(0, 7); // YYYY-MM
  var startDate = month + '-01';

  // Get all stores assigned to this TSR
  var storesRes = await supabaseClient
    .from('stores')
    .select('id,store_status,prospect_stage,last_visit_at,last_order_at,mtd_volume_mt,prev_month_volume_mt,share_of_stomach,risk_status,converted_at,created_at,name')
    .eq('assigned_tsr', tsrId);

  var stores = (storesRes && storesRes.data) || [];

  // Get this month's visits by TSR
  var visitsRes = await supabaseClient
    .from('visits')
    .select('id,store_id,order_taken,order_amount,visited_at')
    .eq('tsr_id', tsrId)
    .gte('visited_at', startDate);

  var visits = (visitsRes && visitsRes.data) || [];

  // PROSPECTION — stores registered + active prospects
  var newStores = stores.filter(function (s) {
    return s.created_at && s.created_at >= startDate;
  });
  var prospects = stores.filter(function (s) { return s.store_status === 'prospect'; });
  var prospectScore = Math.min(5, (prospects.length / 4) * 5);

  // CONVERSION — prospects converted this month
  var convertedThisMonth = stores.filter(function (s) {
    return s.converted_at && s.converted_at >= startDate;
  });
  var totalPipeline = prospects.length + convertedThisMonth.length;
  var conversionRate = totalPipeline > 0 ? (convertedThisMonth.length / totalPipeline) * 100 : 0;
  var conversionScore = Math.min(5, (conversionRate / 30) * 5);

  // RETENTION — % of active stores visited this month
  var activeStores = stores.filter(function (s) { return s.store_status === 'active' || !s.store_status; });
  var visitedStoreIds = {};
  for (var i = 0; i < visits.length; i++) {
    if (visits[i].store_id) visitedStoreIds[visits[i].store_id] = 1;
  }
  var visitedCount = activeStores.filter(function (s) { return !!visitedStoreIds[s.id]; }).length;
  var retentionRate = activeStores.length > 0 ? (visitedCount / activeStores.length) * 100 : 0;
  var atRiskCount = stores.filter(function (s) { return s.risk_status === 'at_risk'; }).length;
  var churnedCount = stores.filter(function (s) { return s.risk_status === 'lost'; }).length;
  var retentionScore = Math.min(5, (retentionRate / 90) * 5);

  // GROWTH — volume growth MoM + avg SOV
  var totalMtd = stores.reduce(function (sum, s) { return sum + (parseFloat(s.mtd_volume_mt) || 0); }, 0);
  var totalPrev = stores.reduce(function (sum, s) { return sum + (parseFloat(s.prev_month_volume_mt) || 0); }, 0);
  var growthPct = totalPrev > 0 ? ((totalMtd - totalPrev) / totalPrev) * 100 : 0;
  var avgSov = activeStores.length > 0
    ? activeStores.reduce(function (sum, s) { return sum + (parseFloat(s.share_of_stomach) || 0); }, 0) / activeStores.length
    : 0;
  var growthScore = Math.min(5, Math.max(0, (growthPct / 15) * 5));

  var overall = (prospectScore + conversionScore + retentionScore + growthScore) / 4;

  // ── Sprint B-TSR — insight messages (rule-based, Taglish where applicable) ──
  var insights = {
    prospection:
      prospectScore < 1 ? 'Try 2 new cold calls per week' :
      prospectScore < 3 ? 'Magdagdag ng prospects para sa pipeline' :
      prospectScore >= 4 ? 'Top performer in prospection \ud83c\udfc6' : '',
    conversion:
      (convertedThisMonth.length === 0 && prospects.length > 0)
        ? 'Follow up sa prospects mo \u2014 interested pero hindi pa nag-o-order'
        : conversionRate < 15 ? 'Conversion rate mababa \u2014 1:1 sa DSM mo'
        : conversionRate >= 30 ? 'Converting like a pro!'
        : '',
    retention:
      retentionRate < 60
        ? Math.max(0, activeStores.length - visitedCount) + ' stores hindi pa nabibisita ngayong buwan'
        : atRiskCount > 3 ? atRiskCount + ' accounts at-risk \u2014 bisitahin agad'
        : retentionRate >= 90 ? 'Top 10% retention \ud83c\udfc6'
        : '',
    growth:
      growthPct < -10 ? 'Declining accounts \u2014 needs attention'
      : growthPct < 0 ? 'Volume bumababa \u2014 try upsell tactics'
      : growthPct >= 15 ? 'Strong growth \u2014 keep going!'
      : ''
  };

  return {
    prospection: {
      score: Math.round(prospectScore * 10) / 10,
      new_stores: newStores.length,
      prospects_count: prospects.length,
      stars: Math.round(prospectScore),
      insight: insights.prospection
    },
    conversion: {
      score: Math.round(conversionScore * 10) / 10,
      converted: convertedThisMonth.length,
      pipeline: totalPipeline,
      rate: Math.round(conversionRate),
      stars: Math.round(conversionScore),
      insight: insights.conversion
    },
    retention: {
      score: Math.round(retentionScore * 10) / 10,
      visited_pct: Math.round(retentionRate),
      visited_count: visitedCount,
      total_active: activeStores.length,
      at_risk: atRiskCount,
      churned: churnedCount,
      stars: Math.round(retentionScore),
      insight: insights.retention
    },
    growth: {
      score: Math.round(growthScore * 10) / 10,
      growth_pct: Math.round(growthPct * 10) / 10,
      mtd_mt: Math.round(totalMtd * 10) / 10,
      avg_sov: Math.round(avgSov),
      stars: Math.round(growthScore),
      insight: insights.growth
    },
    overall: Math.round(overall * 10) / 10,
    overall_stars: Math.round(overall)
  };
}

async function calculateDsmScorecard(dsmId, month) {
  month = month || new Date().toISOString().slice(0, 7);

  var tsrsRes = await supabaseClient
    .from('users')
    .select('id,name,role')
    .eq('manager_id', dsmId)
    .eq('is_active', true);

  var tsrs = (tsrsRes && tsrsRes.data) || [];
  if (tsrs.length === 0) return { empty: true };

  var tsrScorecards = await Promise.all(tsrs.map(function (t) {
    return calculateTsrScorecard(t.id, month).then(function (sc) {
      sc.tsr_id = t.id;
      sc.tsr_name = t.name;
      sc.tsr_role = t.role;
      return sc;
    });
  }));

  var agg = {
    tsr_count: tsrs.length,
    total_new_stores: 0,
    total_prospects: 0,
    total_conversions: 0,
    avg_conversion_rate: 0,
    avg_retention_rate: 0,
    total_at_risk: 0,
    total_churned: 0,
    total_mt: 0,
    avg_growth_pct: 0,
    avg_overall_score: 0,
    tsr_scorecards: tsrScorecards
  };

  tsrScorecards.forEach(function (sc) {
    agg.total_new_stores += sc.prospection.new_stores;
    agg.total_prospects += sc.prospection.prospects_count;
    agg.total_conversions += sc.conversion.converted;
    agg.avg_conversion_rate += sc.conversion.rate;
    agg.avg_retention_rate += sc.retention.visited_pct;
    agg.total_at_risk += sc.retention.at_risk;
    agg.total_churned += sc.retention.churned;
    agg.total_mt += sc.growth.mtd_mt;
    agg.avg_growth_pct += sc.growth.growth_pct;
    agg.avg_overall_score += sc.overall;
  });

  var n = tsrScorecards.length;
  agg.avg_conversion_rate = Math.round(agg.avg_conversion_rate / n);
  agg.avg_retention_rate = Math.round(agg.avg_retention_rate / n);
  agg.avg_growth_pct = Math.round((agg.avg_growth_pct / n) * 10) / 10;
  agg.avg_overall_score = Math.round((agg.avg_overall_score / n) * 10) / 10;

  tsrScorecards.sort(function (a, b) { return b.overall - a.overall; });
  tsrScorecards.forEach(function (sc, i) { sc.rank = i + 1; });

  return agg;
}

// ── UI helpers ──
function renderStars(count) {
  count = Math.max(0, Math.min(5, parseInt(count) || 0));
  var filled = '';
  var empty = '';
  for (var i = 0; i < count; i++) filled += '\u2b50';
  for (var j = 0; j < 5 - count; j++) empty += '\u2606';
  return filled + empty;
}

function getGradient(seed) {
  var palette = [
    'linear-gradient(135deg,#4A90E2,#6BA3E8)',
    'linear-gradient(135deg,#7EB87E,#95C695)',
    'linear-gradient(135deg,#C78AD9,#D5A0E2)',
    'linear-gradient(135deg,#F2B14A,#F7C97A)',
    'linear-gradient(135deg,#E8746E,#F0958F)'
  ];
  var h = 0;
  var s = String(seed || 'x');
  for (var i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return palette[Math.abs(h) % palette.length];
}

// ── TSR Home hero card (Sprint B-TSR: row-based stages with insights) ──
async function renderTsrScorecardHero() {
  var session = getSession();
  if (!session) return;
  if (session.role !== 'tsr' && session.role !== 'champion') return;

  var container = document.getElementById('tsr-scorecard-container');
  if (!container) return;

  try {
    var sc = await calculateTsrScorecard(session.id);
    var title = (T.myScorecard || 'Scorecard ko ngayong buwan');
    var html =
      '<div class="scorecard-hero">' +
        '<div class="sc-header">' +
          '<div class="sc-title">\ud83d\udcca ' + title + '</div>' +
          '<div class="sc-rank">\u2b50 ' + sc.overall + ' / 5</div>' +
        '</div>' +
        '<div class="sc-stages">' +
          _scStage('\ud83d\udd0d', T.prospection || 'Prospeksyon', sc.prospection.stars,
            sc.prospection.new_stores + ' ' + (T.newShort || 'bago') +
              ' \u00b7 ' + sc.prospection.prospects_count + ' prospects', sc.prospection.insight) +
          _scStage('\ud83c\udfaf', T.conversion || 'Konbersyon', sc.conversion.stars,
            sc.conversion.converted + ' ' + (T.converted || 'converted') +
              ' \u00b7 ' + sc.conversion.rate + '% rate', sc.conversion.insight) +
          _scStage('\ud83d\udc9a', T.retention || 'Retention', sc.retention.stars,
            sc.retention.visited_pct + '% ' + (T.visited || 'na-bisita') +
              ' \u00b7 ' + sc.retention.at_risk + ' at-risk', sc.retention.insight) +
          _scStage('\ud83d\udcc8', T.growth || 'Paglago', sc.growth.stars,
            (sc.growth.growth_pct >= 0 ? '+' : '') + sc.growth.growth_pct + '% MoM' +
              ' \u00b7 ' + sc.growth.mtd_mt + ' MT', sc.growth.insight) +
        '</div>' +
      '</div>';
    container.innerHTML = html;
  } catch (e) { console.warn('renderTsrScorecardHero:', e); }
}

function _scStage(icon, name, stars, metric, insight) {
  var insightHtml = insight
    ? '<div class="sc-stage-insight">' + insight + '</div>'
    : '';
  return '<div class="sc-stage">' +
    '<div class="sc-stage-top">' +
      '<span class="sc-stage-icon">' + icon + '</span>' +
      '<span class="sc-stage-name">' + name + '</span>' +
      '<span class="sc-stage-stars">' + renderStars(stars) + '</span>' +
    '</div>' +
    '<div class="sc-stage-metric">' + metric + '</div>' +
    insightHtml +
  '</div>';
}

function showScorecardDetail(category) {
  // Lightweight toast — fuller detail sheet can come in a later pass
  var names = {
    prospection: T.prospection || 'Prospection',
    conversion: T.conversion || 'Conversion',
    retention: T.retention || 'Retention',
    growth: T.growth || 'Growth'
  };
  var msg = names[category] || category;
  var toast = document.createElement('div');
  toast.className = 'data-usage-toast visible';
  toast.textContent = msg;
  toast.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#0084FF;color:white;padding:14px 24px;border-radius:22px;font-weight:700;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,0.3)';
  document.body.appendChild(toast);
  setTimeout(function () { toast.remove(); }, 1800);
}

// ── Celebration overlay (prospect -> first order) ──
function showConversionCelebration(storeName) {
  var overlay = document.createElement('div');
  overlay.className = 'conversion-celebration';
  var confettiHtml = '';
  for (var i = 0; i < 24; i++) {
    var d = (Math.random() * 1.5).toFixed(2);
    var x = Math.round(Math.random() * 100 - 50);
    confettiHtml += '<span class="confetti" style="--d:' + d + 's;--x:' + x + 'vw"></span>';
  }
  overlay.innerHTML =
    '<div class="conv-celeb-inner">' +
      '<div class="conv-celeb-emoji">\ud83c\udf89</div>' +
      '<div class="conv-celeb-title">UNANG ORDER!</div>' +
      '<div class="conv-celeb-store">' + (storeName || '') + '</div>' +
      '<div class="conv-celeb-sub">Na-convert mo si ' + (storeName || 'tindahan') + '! \ud83d\udcaa</div>' +
    '</div>' +
    '<div class="conv-celeb-confetti">' + confettiHtml + '</div>';
  document.body.appendChild(overlay);
  setTimeout(function () {
    overlay.style.opacity = '0';
    setTimeout(function () { overlay.remove(); }, 500);
  }, 2800);
}

window.calculateTsrScorecard = calculateTsrScorecard;
window.calculateDsmScorecard = calculateDsmScorecard;
window.renderTsrScorecardHero = renderTsrScorecardHero;
window.showScorecardDetail = showScorecardDetail;
window.showConversionCelebration = showConversionCelebration;
window.renderStars = renderStars;
window.getGradient = getGradient;
