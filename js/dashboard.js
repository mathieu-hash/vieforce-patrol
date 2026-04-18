// DSM Dashboard Module — Elite redesign v2 (Sprint B-DSM)
// Renders Hero metric + Segment Matrix v2 + Product Penetration v2 +
// Visit Trend v2 + TSR Leaderboard + Critical Alerts v2 + Team CTA + Export.
// All output lands in #dsm-dash-v2-root so the page shell in app.html
// stays minimal.

// ── Formatters & helpers ─────────────────────────────────────

function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '\u20b10';
  var n = parseFloat(amount);
  if (n >= 1000000) return '\u20b1' + (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000)    return '\u20b1' + (n / 1000).toFixed(1) + 'K';
  return '\u20b1' + Math.round(n);
}

function _ddEsc(s) {
  if (s == null) return '';
  var d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

function _ddInitials(name) {
  if (!name) return '?';
  var parts = String(name).split(/\s+/);
  return ((parts[0] || '?').charAt(0) + (parts[1] ? parts[1].charAt(0) : '')).toUpperCase();
}

function _fmtInt(n) {
  return (parseFloat(n) || 0).toLocaleString('en-PH');
}

// Stable gradient picker for alert avatars
function _alertGradient(seed) {
  var palette = [
    'linear-gradient(135deg,#FA383E,#EC4899)',
    'linear-gradient(135deg,#F97316,#FA383E)',
    'linear-gradient(135deg,#F59E0B,#EA580C)',
    'linear-gradient(135deg,#A855F7,#EC4899)',
    'linear-gradient(135deg,#0084FF,#A855F7)',
    'linear-gradient(135deg,#F472B6,#EC4899)'
  ];
  var h = 0;
  var s = String(seed || 'x');
  for (var i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return palette[Math.abs(h) % palette.length];
}

function _getISOWeek(date) {
  var d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  var week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

function _getISOWeekYear(date) {
  var d = new Date(date.getTime());
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  return d.getFullYear();
}

// ── 1. Hero metric (Volume MTD) ──────────────────────────────

function _renderHeroMetric(stores) {
  var currentMt = 0, prevMt = 0;
  for (var i = 0; i < stores.length; i++) {
    currentMt += parseFloat(stores[i].mtd_volume_mt) || 0;
    prevMt    += parseFloat(stores[i].prev_month_volume_mt) || 0;
  }

  var growthPct = prevMt > 0 ? ((currentMt - prevMt) / prevMt) * 100 : 0;
  var growthDir = growthPct > 1 ? 'up' : growthPct < -1 ? 'down' : 'flat';
  var growthSym = growthDir === 'up' ? '\u2191' : growthDir === 'down' ? '\u2193' : '\u2194';
  var growthLabel = prevMt > 0
    ? growthSym + ' ' + Math.abs(growthPct).toFixed(1) + '% vs last month'
    : 'First month on record';

  // Reuse the forecast module if loaded; fall back to inline linear projection.
  var forecast;
  if (typeof computeDsmForecast === 'function') {
    forecast = computeDsmForecast({ total_mt: currentMt, total_churned: 0 });
  } else {
    var now = new Date();
    var daysElapsed = now.getDate();
    var daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var projected = daysElapsed > 0 ? currentMt * (daysInMonth / daysElapsed) : currentMt;
    forecast = { target: 450, projectedEom: projected, gap: 450 - projected, fillPct: Math.min(100, (currentMt / 450) * 100) };
  }

  var gap = forecast.gap;
  var projectionLine = gap > 0.5
    ? '\ud83d\udcca Projected: ' + _fmtInt(Math.round(forecast.projectedEom)) + ' MT (short ' + _fmtInt(Math.round(Math.abs(gap))) + ' MT)'
    : gap < -0.5
      ? '\ud83d\udcca Projected: ' + _fmtInt(Math.round(forecast.projectedEom)) + ' MT (exceeding by ' + _fmtInt(Math.round(Math.abs(gap))) + ' MT)'
      : '\ud83d\udcca Projected: ' + _fmtInt(Math.round(forecast.projectedEom)) + ' MT (on target)';

  var pct = Math.round((currentMt / (forecast.target || 450)) * 100);
  pct = Math.max(0, Math.min(100, pct));

  return '<div class="hero-metric">' +
    '<div class="hero-label">\ud83d\udcc8 Volume Month-to-Date</div>' +
    '<div class="hero-value">' + _fmtInt(Math.round(currentMt)) + ' <span class="hero-unit">MT</span></div>' +
    '<div class="hero-trend ' + growthDir + '">' + growthLabel + '</div>' +
    '<div class="hero-progress">' +
      '<div class="hero-progress-bar">' +
        '<div class="hero-progress-fill" style="width:' + pct + '%"></div>' +
      '</div>' +
      '<div class="hero-progress-meta">' +
        '<span>0</span>' +
        '<span><b>' + _fmtInt(Math.round(currentMt)) + '/' + _fmtInt(forecast.target) + '</b> \u00b7 ' + pct + '% to target</span>' +
        '<span>' + _fmtInt(forecast.target) + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="hero-projection">' + projectionLine + '</div>' +
  '</div>';
}

// ── 2. Segment matrix ────────────────────────────────────────

var SEGMENT_META = {
  'A-A': { key: 'champion',   label: 'Champion',      desc: 'High volume, high coverage — protect' },
  'A-B': { key: 'grow-vol',   label: 'Grow Vol',      desc: 'High coverage, mid volume — push bags' },
  'A-C': { key: 'underperf',  label: '\u26a0 Underperf', desc: 'High volume at risk — recover coverage' },
  'B-A': { key: 'cross-sell', label: 'Cross-sell',    desc: 'Strong coverage, mid vol — add SKUs' },
  'B-B': { key: 'solid-mid',  label: 'Solid Mid',     desc: 'Steady mid performers — nurture' },
  'B-C': { key: 'nurture',    label: 'Nurture',       desc: 'Mid vol, low cov — build routine' },
  'C-A': { key: 'goldmine',   label: 'Goldmine',      desc: 'Untapped coverage — upsell volume' },
  'C-B': { key: 'entry',      label: 'Entry',         desc: 'Low vol — test products' },
  'C-C': { key: 'monitor',    label: 'Monitor',       desc: 'Low vol & cov — keep watch' }
};

function _renderSegmentMatrix(stores) {
  // Count stores per Vol-Cov cell
  var grid = {};
  var volClasses = ['A', 'B', 'C'];
  var covClasses = ['A', 'B', 'C'];
  volClasses.forEach(function (v) {
    covClasses.forEach(function (c) { grid[v + '-' + c] = { count: 0, stores: [] }; });
  });
  for (var i = 0; i < stores.length; i++) {
    var s = stores[i];
    var vol = (s.vol_class || 'C').toUpperCase();
    var cov = (s.cov_class || 'C').toUpperCase();
    var k = vol + '-' + cov;
    if (grid[k]) {
      grid[k].count++;
      grid[k].stores.push(s);
    }
  }
  // Stash for showSegment()
  window._dsmSegmentGrid = grid;

  var html =
    '<div class="segment-card">' +
      '<div class="card-header">' +
        '<div class="card-title">\ud83c\udfaf Store Segment Matrix</div>' +
        '<div class="card-help" title="Vol = volume class (A=high, C=low). Cov = coverage class (A=high, C=low).">\u24d8</div>' +
      '</div>' +
      '<div class="card-sub">Tap a segment to see stores</div>' +
      '<div class="matrix-grid">' +
        '<div class="matrix-cell-hdr"></div>' +
        '<div class="matrix-cell-hdr">High Cov</div>' +
        '<div class="matrix-cell-hdr">Med Cov</div>' +
        '<div class="matrix-cell-hdr">Low Cov</div>';

  var volLabels = { A: 'High Vol', B: 'Med Vol', C: 'Low Vol' };
  volClasses.forEach(function (v) {
    html += '<div class="matrix-cell-hdr-y">' + volLabels[v] + '</div>';
    covClasses.forEach(function (c) {
      var k = v + '-' + c;
      var meta = SEGMENT_META[k];
      var count = grid[k].count;
      html += '<div class="matrix-cell ' + meta.key + '" onclick="showSegment(\'' + k + '\')">' +
        '<div class="matrix-cell-num">' + count + '</div>' +
        '<div class="matrix-cell-label">' + _ddEsc(meta.label) + '</div>' +
      '</div>';
    });
  });

  html +=
    '</div>' +
    '<div class="matrix-legend">' +
      '<span><span class="legend-item legend-good">\u25cf</span> Good</span>' +
      '<span><span class="legend-item legend-warn">\u25cf</span> Watch</span>' +
      '<span><span class="legend-item legend-bad">\u25cf</span> Action needed</span>' +
    '</div>' +
  '</div>';

  return html;
}

// Bottom sheet with the list of stores in a selected segment cell.
function showSegment(segmentKey) {
  var grid = window._dsmSegmentGrid || {};
  var cell = grid[segmentKey];
  var meta = SEGMENT_META[segmentKey] || { label: segmentKey, desc: '' };
  var storesList = (cell && cell.stores) || [];

  var existing = document.getElementById('dsm-segment-sheet');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'dsm-segment-sheet';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1000;display:flex;align-items:flex-end;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);';
  overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };

  var card =
    '<div style="background:#fff;width:100%;max-width:520px;margin:0 auto;border-radius:20px 20px 0 0;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 -8px 32px rgba(0,0,0,0.2)" onclick="event.stopPropagation()">' +
      '<div style="padding:14px 20px;border-bottom:1px solid rgba(0,0,0,0.06);display:flex;justify-content:space-between;align-items:center">' +
        '<div><div style="font-size:16px;font-weight:800;color:#050505">' + _ddEsc(meta.label) + '</div>' +
          '<div style="font-size:12px;color:#65676B;margin-top:2px">' + _ddEsc(meta.desc) + ' \u00b7 ' + storesList.length + ' stores</div>' +
        '</div>' +
        '<button onclick="this.closest(\'#dsm-segment-sheet\').remove()" style="background:none;border:none;font-size:24px;color:#65676B;cursor:pointer;padding:0 6px">\u00d7</button>' +
      '</div>' +
      '<div style="overflow-y:auto;flex:1">';

  if (storesList.length === 0) {
    card += '<div style="padding:40px 24px;text-align:center;color:#65676B;font-size:13px">Walang store sa segment na ito.</div>';
  } else {
    for (var i = 0; i < storesList.length; i++) {
      var s = storesList[i];
      var health = s.health_status === 'crit' ? '#FA383E' : s.health_status === 'warn' ? '#F7B928' : '#31A24C';
      var loc = s.city || s.province || s.region || '\u2014';
      card +=
        '<div onclick="openStoreDetail(\'' + _ddEsc(s.id) + '\');document.getElementById(\'dsm-segment-sheet\').remove()" ' +
        'style="padding:12px 20px;border-bottom:1px solid rgba(0,0,0,0.05);display:flex;gap:12px;align-items:center;cursor:pointer">' +
          '<div style="width:8px;height:8px;border-radius:50%;background:' + health + ';flex-shrink:0"></div>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:14px;font-weight:700;color:#050505;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _ddEsc(s.name) + '</div>' +
            '<div style="font-size:11px;color:#65676B;margin-top:2px">' + _ddEsc(loc) + ' \u00b7 ' + (s.bags_per_month || 0) + ' bags/mo</div>' +
          '</div>' +
          '<div style="background:rgba(0,132,255,0.08);color:#0084FF;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:800">Vol ' + (s.vol_class || 'C') + '</div>' +
        '</div>';
    }
  }

  card += '</div></div>';
  overlay.innerHTML = card;
  document.body.appendChild(overlay);
}

// ── 3. Product penetration ───────────────────────────────────

async function _renderProductPenetration(stores) {
  var totalStores = stores.length;
  if (totalStores === 0) {
    return '<div class="penetration-card">' +
      '<div class="card-header"><div class="card-title">\ud83c\udfaf Product Penetration</div></div>' +
      '<div class="pen-empty">\ud83d\udca1 Walang store data pa. Ang TSR mo ay magdagdag ng stores sa app.</div>' +
    '</div>';
  }

  var storeIds = stores.map(function (s) { return s.id; });

  var productsRes = await supabaseClient
    .from('store_products')
    .select('store_id, product_group')
    .eq('is_vienovo', true)
    .in('store_id', storeIds);
  var products = (productsRes && productsRes.data) || [];

  var groups = [
    { key: 'hog',      label: 'Hog feed',       icon: '\ud83d\udc16' },
    { key: 'poultry',  label: 'Poultry feed',   icon: '\ud83d\udc14' },
    { key: 'gamefowl', label: 'Gamefowl feed',  icon: '\ud83d\udc13' },
    { key: 'aqua',     label: 'Aqua feed',      icon: '\ud83d\udc1f' },
    { key: 'pet',      label: 'Pet food',       icon: '\ud83d\udc15' },
    { key: 'dairy',    label: 'Dairy feed',     icon: '\ud83d\udc04' }
  ];

  var groupStores = {};
  groups.forEach(function (g) { groupStores[g.key] = {}; });
  for (var i = 0; i < products.length; i++) {
    var g = products[i].product_group;
    if (groupStores[g]) groupStores[g][products[i].store_id] = true;
  }

  var anyData = false;
  var rows = '';
  groups.forEach(function (g) {
    var storeCount = Object.keys(groupStores[g.key]).length;
    var pct = Math.round((storeCount / totalStores) * 100);
    if (storeCount > 0) anyData = true;
    rows += '<div class="pen-row">' +
      '<div class="pen-icon">' + g.icon + '</div>' +
      '<div class="pen-info">' +
        '<div class="pen-name">' + g.label + '</div>' +
        '<div class="pen-bar"><div class="pen-bar-fill ' + g.key + '" style="width:' + pct + '%"></div></div>' +
      '</div>' +
      '<div class="pen-stat">' +
        '<div class="pen-pct">' + pct + '%</div>' +
        '<div class="pen-count">' + storeCount + '/' + totalStores + '</div>' +
      '</div>' +
    '</div>';
  });

  var emptyNote = anyData ? '' :
    '<div class="pen-empty">\ud83d\udca1 Walang product data pa. Ang TSR mo ay magdagdag ng product info during visits.</div>';

  return '<div class="penetration-card">' +
    '<div class="card-header"><div class="card-title">\ud83c\udfaf Product Penetration</div></div>' +
    '<div class="card-sub">% of stores carrying each Vienovo line</div>' +
    rows +
    emptyNote +
  '</div>';
}

// ── 4. Visit trend ───────────────────────────────────────────

var _dsmVisitChart = null;

async function _renderVisitTrend() {
  var fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  var eightWeeksAgo = new Date();
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

  // Pull last 8 weeks so we can compute period-over-period trend
  var res = await supabaseClient
    .from('visits')
    .select('visited_at, order_taken')
    .gte('visited_at', eightWeeksAgo.toISOString())
    .order('visited_at', { ascending: true });
  var visits = (res && res.data) || [];

  // Group by ISO week
  var weekMap = {};
  for (var i = 0; i < visits.length; i++) {
    var d = new Date(visits[i].visited_at);
    var yr = _getISOWeekYear(d);
    var wk = _getISOWeek(d);
    var key = yr + '-W' + (wk < 10 ? '0' : '') + wk;
    if (!weekMap[key]) weekMap[key] = { regular: 0, order: 0 };
    if (visits[i].order_taken) weekMap[key].order++;
    else weekMap[key].regular++;
  }

  // Build arrays for last 4 weeks + prev 4 weeks
  var now = new Date();
  var labels = [], regularData = [], orderData = [];
  var currentTotal = 0, prevTotal = 0;

  for (var w = 3; w >= 0; w--) {
    var ref = new Date(now.getTime() - w * 7 * 86400000);
    var ry = _getISOWeekYear(ref);
    var rw = _getISOWeek(ref);
    var rKey = ry + '-W' + (rw < 10 ? '0' : '') + rw;
    labels.push('W' + rw);
    var bucket = weekMap[rKey] || { regular: 0, order: 0 };
    regularData.push(bucket.regular);
    orderData.push(bucket.order);
    currentTotal += bucket.regular + bucket.order;
  }
  for (var pw = 7; pw >= 4; pw--) {
    var pref = new Date(now.getTime() - pw * 7 * 86400000);
    var pry = _getISOWeekYear(pref);
    var prw = _getISOWeek(pref);
    var pKey = pry + '-W' + (prw < 10 ? '0' : '') + prw;
    var pbucket = weekMap[pKey] || { regular: 0, order: 0 };
    prevTotal += pbucket.regular + pbucket.order;
  }

  var totalVisits = currentTotal;
  var deltaPct = prevTotal > 0 ? Math.round(((currentTotal - prevTotal) / prevTotal) * 100) : 0;
  var deltaDir = deltaPct > 0 ? 'up' : deltaPct < 0 ? 'down' : 'flat';
  var deltaLabel = deltaPct === 0 && prevTotal === 0
    ? 'No prior period'
    : (deltaPct > 0 ? '\u2191' : deltaPct < 0 ? '\u2193' : '\u2014') + Math.abs(deltaPct) + '%';

  var cardHtml = '<div class="trend-card">' +
    '<div class="card-header">' +
      '<div class="card-title">\ud83d\udcca Visit Trend</div>' +
      '<div class="card-period">Last 4 weeks</div>' +
    '</div>' +
    '<div class="trend-summary">' +
      '<div class="trend-stat"><div class="trend-num">' + totalVisits + '</div><div class="trend-lbl">Total visits</div></div>' +
      '<div class="trend-stat"><div class="trend-num ' + deltaDir + '">' + deltaLabel + '</div><div class="trend-lbl">vs prev period</div></div>' +
    '</div>' +
    '<div class="trend-chart-wrap"><canvas id="dsm-visit-chart"></canvas></div>' +
  '</div>';

  // Defer Chart.js wiring until the canvas is in the DOM.
  setTimeout(function () {
    var canvas = document.getElementById('dsm-visit-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (_dsmVisitChart) { try { _dsmVisitChart.destroy(); } catch (_) {} _dsmVisitChart = null; }
    var ctx = canvas.getContext('2d');
    _dsmVisitChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: '\ud83d\udccb Regular',
            data: regularData,
            backgroundColor: 'rgba(0,132,255,0.85)',
            borderRadius: 8,
            borderSkipped: false,
            barThickness: 32,
            stack: 'visits'
          },
          {
            label: '\ud83d\udcb0 Order',
            data: orderData,
            backgroundColor: 'rgba(168,85,247,0.85)',
            borderRadius: 8,
            borderSkipped: false,
            barThickness: 32,
            stack: 'visits'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: { font: { size: 11, weight: 700 }, boxWidth: 12, padding: 8 }
          },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.85)',
            padding: 10,
            cornerRadius: 10,
            titleFont: { size: 13, weight: 800 },
            bodyFont: { size: 12 }
          }
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { font: { size: 11, weight: 700 } }
          },
          y: {
            stacked: true,
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: { font: { size: 10 }, stepSize: 1, precision: 0 }
          }
        }
      }
    });
  }, 0);

  return cardHtml;
}

// ── 5. TSR Leaderboard ───────────────────────────────────────

async function _renderLeaderboardCard() {
  var results = await Promise.all([ getUsers(), getAssignmentCounts() ]);
  var users = results[0] || [];
  var assignCounts = results[1] || {};

  var tsrUsers = users.filter(function (u) { return u.role === 'tsr' && u.is_active; });
  if (tsrUsers.length === 0) {
    return '<div class="lb-card">' +
      '<div class="card-header"><div class="card-title">\ud83c\udfc6 TSR Leaderboard</div></div>' +
      '<div style="padding:24px;text-align:center;color:#65676B;font-size:13px">No active TSRs yet.</div>' +
    '</div>';
  }

  var weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  var visitsRes = await supabaseClient
    .from('visits')
    .select('tsr_id, order_taken, order_amount')
    .gte('visited_at', weekAgo.toISOString());
  var visits = (visitsRes && visitsRes.data) || [];

  var tsrMap = {};
  tsrUsers.forEach(function (u) {
    tsrMap[u.id] = { user: u, visitCount: 0, orderTotal: 0, assignedStores: assignCounts[u.id] || 0 };
  });
  for (var v = 0; v < visits.length; v++) {
    var tid = visits[v].tsr_id;
    if (tsrMap[tid]) {
      tsrMap[tid].visitCount++;
      if (visits[v].order_taken) tsrMap[tid].orderTotal += parseFloat(visits[v].order_amount) || 0;
    }
  }

  var ranked = Object.keys(tsrMap).map(function (k) { return tsrMap[k]; });
  ranked.sort(function (a, b) { return b.visitCount - a.visitCount; });
  var top = ranked.slice(0, 10);

  var rowsHtml = '';
  top.forEach(function (entry, i) {
    var pos = i + 1;
    var medal = pos === 1 ? '\ud83e\udd47' : pos === 2 ? '\ud83e\udd48' : pos === 3 ? '\ud83e\udd49' : '';
    var rankClass = pos === 1 ? 'gold' : pos === 2 ? 'silver' : pos === 3 ? 'bronze' : '';
    var territory = entry.user.territory || entry.user.district || entry.user.region || '\u2014';
    var storeLabel = entry.assignedStores + ' store' + (entry.assignedStores !== 1 ? 's' : '');
    var safeName = _ddEsc(entry.user.name).replace(/'/g, "\\'");
    rowsHtml +=
      '<div class="list-row" style="cursor:pointer" onclick="showTSRAssignedStores(\'' + entry.user.id + '\',\'' + safeName + '\')">' +
        '<div class="rank ' + rankClass + '">' + (medal || pos) + '</div>' +
        '<div style="flex:1">' +
          '<b style="font-size:13px">' + _ddEsc(entry.user.name) + '</b>' +
          '<div style="font-size:11px;color:#65676B">' + _ddEsc(territory) + ' \u00b7 ' + entry.visitCount + ' visits</div>' +
          '<div style="font-size:10px;color:#0084FF;margin-top:2px">' + storeLabel + '</div>' +
        '</div>' +
        '<div style="text-align:right;font-size:12px">' +
          '<b style="color:#10B981">' + formatCurrency(entry.orderTotal) + '</b><br>' +
          '<span style="font-size:10px;color:#65676B">orders</span>' +
        '</div>' +
      '</div>';
  });

  return '<div class="lb-card">' +
    '<div class="card-header">' +
      '<div class="card-title">\ud83c\udfc6 TSR Leaderboard</div>' +
      '<button class="assign-cta" onclick="nav(\'page-assign\')">I-assign ang Stores</button>' +
    '</div>' +
    '<div class="card-sub">Last 7 days activity</div>' +
    '<div class="lb-host">' + rowsHtml + '</div>' +
  '</div>';
}

// Modal — retained (used by leaderboard rows)
async function showTSRAssignedStores(tsrId, tsrName) {
  try {
    var stores = await getStoresByTSR(tsrId);
    var existing = document.getElementById('tsr-stores-modal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'tsr-stores-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.45);z-index:500;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);';
    modal.onclick = function (e) { if (e.target === modal) modal.remove(); };

    var card = '<div style="background:#fff;max-width:400px;width:90%;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,0.2);overflow:hidden;max-height:80vh;display:flex;flex-direction:column" onclick="event.stopPropagation()">';
    card += '<div style="background:linear-gradient(135deg,#0084FF,#A855F7);color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center">';
    card += '<div><div style="font-size:14px;font-weight:800">' + _ddEsc(tsrName) + '</div><div style="font-size:11px;opacity:0.85">' + stores.length + ' assigned stores</div></div>';
    card += '<button onclick="this.closest(\'#tsr-stores-modal\').remove()" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;padding:0 4px">\u00d7</button>';
    card += '</div><div style="overflow-y:auto;flex:1">';

    if (stores.length === 0) {
      card += '<div style="text-align:center;color:#65676B;padding:24px;font-size:13px">Walang assigned stores</div>';
    } else {
      for (var i = 0; i < stores.length; i++) {
        var s = stores[i];
        var loc = s.city || s.province || s.region || '\u2014';
        var hColor = s.health_status === 'crit' ? '#FA383E' : s.health_status === 'warn' ? '#F7B928' : '#31A24C';
        card += '<div style="padding:10px 18px;border-bottom:1px solid rgba(0,0,0,0.05);display:flex;align-items:center;gap:8px">';
        card += '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + hColor + ';flex-shrink:0"></span>';
        card += '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#050505">' + _ddEsc(s.name) + '</div>';
        card += '<div style="font-size:11px;color:#65676B">' + _ddEsc(loc) + '</div></div>';
        if (s.vol_class) {
          card += '<span style="background:rgba(0,132,255,0.08);color:#0084FF;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:800">Vol ' + s.vol_class + '</span>';
        }
        card += '</div>';
      }
    }

    card += '</div></div>';
    modal.innerHTML = card;
    document.body.appendChild(modal);
  } catch (err) { console.error('showTSRAssignedStores:', err); }
}

// ── 6. Critical alerts ───────────────────────────────────────

function _renderCriticalAlerts(stores) {
  var now = Date.now();
  var fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
  var alerts = [];

  for (var i = 0; i < stores.length; i++) {
    var s = stores[i];
    if (s.health_status === 'crit') {
      alerts.push({ store: s, desc: 'Critical health \u00b7 immediate action', severity: 'crit' });
      continue;
    }
    var vol = (s.vol_class || '').toUpperCase();
    if (vol === 'A' || vol === 'B') {
      if (!s.last_visit_at) {
        alerts.push({ store: s, desc: 'Vol ' + vol + ' store \u00b7 never visited', severity: 'warn' });
      } else {
        var daysSince = Math.floor((now - new Date(s.last_visit_at).getTime()) / 86400000);
        if (daysSince > 14) {
          alerts.push({ store: s, desc: 'Vol ' + vol + ' \u00b7 ' + daysSince + ' days since last visit', severity: 'warn' });
        }
      }
    }
  }

  alerts.sort(function (a, b) { return a.severity === 'crit' ? -1 : 1; });
  alerts = alerts.slice(0, 8);

  var headerBadge = alerts.length === 0
    ? '<div class="alert-count zero">0</div>'
    : '<div class="alert-count">' + alerts.length + '</div>';

  if (alerts.length === 0) {
    return '<div class="alerts-card">' +
      '<div class="card-header">' +
        '<div class="card-title">\ud83d\udea8 Critical Alerts</div>' + headerBadge +
      '</div>' +
      '<div class="alerts-empty">\u2705 No critical alerts \u2014 all clear</div>' +
    '</div>';
  }

  var rowsHtml = '';
  alerts.forEach(function (a) {
    var s = a.store;
    var loc = s.region || s.territory || '\u2014';
    var vol = s.vol_class ? 'Vol ' + s.vol_class : '';
    rowsHtml +=
      '<div class="alert-row" onclick="openStoreDetail(\'' + _ddEsc(s.id) + '\')">' +
        '<div class="alert-av" style="background:' + _alertGradient(s.id) + '">' + _ddEsc(_ddInitials(s.name)) + '</div>' +
        '<div>' +
          '<div class="alert-name">' + _ddEsc(s.name) + '</div>' +
          '<div class="alert-desc">' + _ddEsc(a.desc) + '</div>' +
          '<div class="alert-meta">\ud83d\udccd ' + _ddEsc(loc) + (vol ? ' \u00b7 \ud83c\udfea ' + vol : '') + '</div>' +
        '</div>' +
        '<div class="alert-arrow">\u2192</div>' +
      '</div>';
  });

  return '<div class="alerts-card">' +
    '<div class="card-header">' +
      '<div class="card-title">\ud83d\udea8 Critical Alerts</div>' + headerBadge +
    '</div>' +
    rowsHtml +
  '</div>';
}

// ── 7. Team CTA ──────────────────────────────────────────────

function _renderTeamCta() {
  return '<div class="team-cta" onclick="nav(\'page-team\')">' +
    '<div>' +
      '<div class="team-cta-title">\ud83d\udc65 Go to Team tab</div>' +
      '<div class="team-cta-sub">Attention items, coaching moments, forecast &amp; audit flags</div>' +
    '</div>' +
    '<div class="team-cta-arrow">\u2192</div>' +
  '</div>';
}

// ── 8. Export section ────────────────────────────────────────

function _renderExportSection() {
  return '<div class="export-card">' +
    '<div class="card-header"><div class="card-title">\ud83d\udce5 Export Data</div></div>' +
    '<div class="card-sub">Download clean Excel reports for offline review</div>' +
    '<div class="export-status" id="export-status"></div>' +
    '<button class="export-btn" onclick="ExportModule.exportVisits()">\ud83d\udcdd I-download ang Visits (Excel)</button>' +
    '<button class="export-btn" onclick="ExportModule.exportStores()">\ud83c\udfea I-download ang Stores (Excel)</button>' +
    '<button class="export-btn" onclick="ExportModule.exportSummary()">\ud83d\udcca I-download ang Summary (Excel)</button>' +
  '</div>';
}

// ── 9. Master render ─────────────────────────────────────────

async function renderDashboardV2() {
  var session = getSession();
  if (!session) return;
  if (['dsm', 'rsm', 'exec', 'admin'].indexOf(session.role) === -1) {
    console.warn('renderDashboardV2: role not authorized:', session.role);
    return;
  }

  var root = document.getElementById('dsm-dash-v2-root');
  if (!root) return;

  // Subtitle reflects scope + name
  var subtitle = document.getElementById('dsm-subtitle');
  if (subtitle) {
    subtitle.textContent = (session.district || session.region || 'All Territories') + ' \u00b7 ' + session.name;
  }

  root.innerHTML =
    '<div class="hero-metric" style="opacity:0.7">' +
      '<div class="hero-label">\ud83d\udcc8 Volume Month-to-Date</div>' +
      '<div class="hero-value">\u2014 <span class="hero-unit">MT</span></div>' +
      '<div class="hero-trend flat">Loading\u2026</div>' +
    '</div>';

  try {
    var stores = await getStores();

    // Fire independent renders in parallel where possible
    var penetrationP = _renderProductPenetration(stores);
    var trendP       = _renderVisitTrend();
    var leaderP      = _renderLeaderboardCard();

    var results = await Promise.all([penetrationP, trendP, leaderP]);

    root.innerHTML =
      _renderHeroMetric(stores) +
      _renderSegmentMatrix(stores) +
      results[0] + // penetration
      results[1] + // trend (chart binds via setTimeout after insert)
      results[2] + // leaderboard
      _renderCriticalAlerts(stores) +
      _renderTeamCta() +
      _renderExportSection();
  } catch (err) {
    console.error('renderDashboardV2:', err);
    root.innerHTML =
      '<div style="margin:12px 16px;padding:20px;background:white;border-radius:16px;text-align:center;color:#FA383E;font-size:13px">' +
        'Hindi ma-load ang dashboard.' +
        '<br><small style="opacity:0.7;color:#65676B">' + _ddEsc(err.message || err) + '</small>' +
      '</div>';
  }
}

// Legacy entry-point name — app.html wires `initDashboard()` on role landing
// and on nav('page-dashboard'). Keep the name; point it at the v2 renderer.
async function initDashboard() {
  return renderDashboardV2();
}

// Public exports
window.initDashboard            = initDashboard;
window.renderDashboardV2        = renderDashboardV2;
window.showSegment              = showSegment;
window.showTSRAssignedStores    = showTSRAssignedStores;
window.formatCurrency           = formatCurrency;
