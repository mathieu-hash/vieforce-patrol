// Dashboard Module — DSM/RSM/Admin dashboard with live Supabase data

// ── Currency Formatter ──

function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '\u20b10';
  var n = parseFloat(amount);
  if (n >= 1000000) {
    return '\u20b1' + (n / 1000000).toFixed(1) + 'M';
  }
  if (n >= 1000) {
    return '\u20b1' + (n / 1000).toFixed(1) + 'K';
  }
  return '\u20b1' + Math.round(n);
}

// ── Helper: ISO week number ──

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

// ── Helper: week label ──

function _weekLabel(year, week) {
  return 'W' + week;
}

// ── 1. Dashboard KPIs ──

async function loadDashboardKPIs() {
  try {
    var stores = await getStores();
    var weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    var weekAgoISO = weekAgo.toISOString();

    // Fetch visits from current month (no TSR filter — DSM sees all)
    var monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    var { data: allVisits, error: vErr } = await supabaseClient
      .from('visits')
      .select('visited_at,order_taken,order_amount,merch_score,tsr_id')
      .gte('visited_at', monthStart.toISOString())
      .order('visited_at', { ascending: false })
      .limit(2000);

    if (vErr) throw new Error(vErr.message);
    allVisits = allVisits || [];

    // Visits this week
    var visitsThisWeek = [];
    for (var i = 0; i < allVisits.length; i++) {
      if (allVisits[i].visited_at >= weekAgoISO) {
        visitsThisWeek.push(allVisits[i]);
      }
    }

    // Total stores
    var totalStores = stores.length;
    var storesEl = document.getElementById('dsm-kpi-stores');
    var storesDelta = document.getElementById('dsm-delta-stores');
    if (storesEl) storesEl.textContent = totalStores;
    if (storesDelta) storesDelta.textContent = totalStores + ' mapped';

    // Total farms
    var farmCount = 0;
    for (var f = 0; f < stores.length; f++) {
      if (stores[f].store_type && stores[f].store_type.toLowerCase().indexOf('farm') !== -1) {
        farmCount++;
      }
    }
    var farmsEl = document.getElementById('dsm-kpi-farms');
    var farmsDelta = document.getElementById('dsm-delta-farms');
    if (farmsEl) farmsEl.textContent = farmCount;
    if (farmsDelta) farmsDelta.textContent = Math.round((farmCount / (totalStores || 1)) * 100) + '% of total';

    // Critical stores
    var critCount = 0;
    for (var c = 0; c < stores.length; c++) {
      if (stores[c].health_status === 'crit') critCount++;
    }
    var critEl = document.getElementById('dsm-kpi-critical');
    var critDelta = document.getElementById('dsm-delta-critical');
    if (critEl) critEl.textContent = critCount;
    if (critDelta) critDelta.textContent = critCount > 0 ? 'need attention' : 'all clear';

    // Visits this week
    var visitsEl = document.getElementById('dsm-kpi-visits');
    var visitsDelta = document.getElementById('dsm-delta-visits');
    if (visitsEl) visitsEl.textContent = visitsThisWeek.length;
    if (visitsDelta) visitsDelta.textContent = '+' + visitsThisWeek.length + ' this week';

    // Orders this week
    var orderTotal = 0;
    var orderCount = 0;
    for (var o = 0; o < visitsThisWeek.length; o++) {
      if (visitsThisWeek[o].order_taken) {
        orderCount++;
        orderTotal += parseFloat(visitsThisWeek[o].order_amount) || 0;
      }
    }
    var ordersEl = document.getElementById('dsm-kpi-orders');
    var ordersDelta = document.getElementById('dsm-delta-orders');
    if (ordersEl) ordersEl.textContent = formatCurrency(orderTotal);
    if (ordersDelta) ordersDelta.textContent = orderCount + ' order' + (orderCount !== 1 ? 's' : '') + ' this week';

    // Avg merch score
    var merchSum = 0;
    var merchCount = 0;
    for (var m = 0; m < allVisits.length; m++) {
      if (allVisits[m].merch_score != null) {
        merchSum += parseFloat(allVisits[m].merch_score);
        merchCount++;
      }
    }
    var avgMerch = merchCount > 0 ? (merchSum / merchCount).toFixed(1) : '--';
    var merchEl = document.getElementById('dsm-kpi-merch');
    var merchDelta = document.getElementById('dsm-delta-merch');
    if (merchEl) merchEl.textContent = avgMerch;
    if (merchDelta) {
      if (merchCount > 0) {
        var target = 4.0;
        var pct = Math.round(((merchSum / merchCount) / target) * 100);
        merchDelta.textContent = pct >= 100 ? '\u2191 on target' : '\u2191 ' + pct + '% vs target';
      } else {
        merchDelta.textContent = 'no data';
      }
    }

  } catch (err) {
    console.error('loadDashboardKPIs:', err);
  }
}

// ── 2. Visit Chart (Chart.js) ──

var _dsmVisitChart = null;

async function loadVisitChart() {
  var canvas = document.getElementById('dsm-visit-chart');
  if (!canvas) return;

  try {
    // Fetch all visits from last 4 weeks
    var fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    var cutoff = fourWeeksAgo.toISOString();

    var { data: visits, error } = await supabaseClient
      .from('visits')
      .select('visited_at, order_taken')
      .gte('visited_at', cutoff)
      .order('visited_at', { ascending: true });

    if (error) throw new Error(error.message);
    visits = visits || [];

    // Group by ISO week
    var weekMap = {}; // key = "YYYY-WNN", value = { regular, order }

    for (var i = 0; i < visits.length; i++) {
      var d = new Date(visits[i].visited_at);
      var yr = _getISOWeekYear(d);
      var wk = _getISOWeek(d);
      var key = yr + '-W' + (wk < 10 ? '0' : '') + wk;

      if (!weekMap[key]) weekMap[key] = { regular: 0, order: 0, label: _weekLabel(yr, wk) };
      if (visits[i].order_taken) {
        weekMap[key].order++;
      } else {
        weekMap[key].regular++;
      }
    }

    // Build sorted arrays for last 4 weeks
    var now = new Date();
    var labels = [];
    var regularData = [];
    var orderData = [];

    for (var w = 3; w >= 0; w--) {
      var ref = new Date(now.getTime() - w * 7 * 86400000);
      var ry = _getISOWeekYear(ref);
      var rw = _getISOWeek(ref);
      var rKey = ry + '-W' + (rw < 10 ? '0' : '') + rw;

      labels.push(_weekLabel(ry, rw));
      if (weekMap[rKey]) {
        regularData.push(weekMap[rKey].regular);
        orderData.push(weekMap[rKey].order);
      } else {
        regularData.push(0);
        orderData.push(0);
      }
    }

    // Destroy previous chart instance
    if (_dsmVisitChart) {
      _dsmVisitChart.destroy();
      _dsmVisitChart = null;
    }

    var ctx = canvas.getContext('2d');
    _dsmVisitChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Regular Visits',
            data: regularData,
            backgroundColor: 'rgba(0, 166, 206, 0.8)',
            borderColor: '#00A6CE',
            borderWidth: 1
          },
          {
            label: 'Order Visits',
            data: orderData,
            backgroundColor: 'rgba(149, 201, 61, 0.8)',
            borderColor: '#95C93D',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            labels: {
              font: { family: 'Montserrat, sans-serif', size: 11 },
              color: '#555'
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            grid: { color: 'rgba(0,0,0,0.06)' },
            ticks: { font: { family: 'Montserrat, sans-serif', size: 11 }, color: '#888' }
          },
          y: {
            stacked: true,
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.06)' },
            ticks: {
              font: { family: 'Montserrat, sans-serif', size: 11 },
              color: '#888',
              stepSize: 1,
              precision: 0
            }
          }
        }
      }
    });

  } catch (err) {
    console.error('loadVisitChart:', err);
  }
}

// ── 3. TSR Leaderboard ──

async function loadTSRLeaderboard() {
  var container = document.getElementById('dsm-leaderboard');
  if (!container) return;

  try {
    // Get all TSR users + assignment counts in parallel
    var results = await Promise.all([
      getUsers(),
      getAssignmentCounts()
    ]);

    var users = results[0];
    var assignCounts = results[1];

    var tsrUsers = [];
    for (var i = 0; i < users.length; i++) {
      if (users[i].role === 'tsr' && users[i].is_active) {
        tsrUsers.push(users[i]);
      }
    }

    // Get visits from last 7 days
    var weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    var cutoff = weekAgo.toISOString();

    var { data: visits, error } = await supabaseClient
      .from('visits')
      .select('tsr_id, order_taken, order_amount')
      .gte('visited_at', cutoff);

    if (error) throw new Error(error.message);
    visits = visits || [];

    // Aggregate per TSR
    var tsrMap = {};
    for (var t = 0; t < tsrUsers.length; t++) {
      tsrMap[tsrUsers[t].id] = {
        user: tsrUsers[t],
        visitCount: 0,
        orderTotal: 0,
        assignedStores: assignCounts[tsrUsers[t].id] || 0
      };
    }

    for (var v = 0; v < visits.length; v++) {
      var tid = visits[v].tsr_id;
      if (tsrMap[tid]) {
        tsrMap[tid].visitCount++;
        if (visits[v].order_taken) {
          tsrMap[tid].orderTotal += parseFloat(visits[v].order_amount) || 0;
        }
      }
    }

    // Sort by visit count desc
    var ranked = [];
    for (var key in tsrMap) {
      if (tsrMap.hasOwnProperty(key)) {
        ranked.push(tsrMap[key]);
      }
    }
    ranked.sort(function (a, b) { return b.visitCount - a.visitCount; });

    // Top 10
    var top = ranked.slice(0, 10);

    if (top.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:#888;font-size:12px;padding:20px">No TSR activity this week</div>';
      return;
    }

    var html = '';
    for (var r = 0; r < top.length; r++) {
      var entry = top[r];
      var pos = r + 1;
      var rankClass = pos === 1 ? 'gold' : pos === 2 ? 'silver' : pos === 3 ? 'bronze' : '';
      var territory = entry.user.territory || entry.user.district || entry.user.region || '--';
      var storeLabel = entry.assignedStores + ' store' + (entry.assignedStores !== 1 ? 's' : '') + ' na-assign';

      html += '<div class="list-row" style="cursor:pointer" onclick="showTSRAssignedStores(\'' + entry.user.id + '\',\'' + _esc(entry.user.name).replace(/'/g, "\\'") + '\')">' +
        '<div class="rank ' + rankClass + '">' + pos + '</div>' +
        '<div style="flex:1">' +
          '<b style="font-size:13px">' + _esc(entry.user.name) + '</b>' +
          '<div style="font-size:11px;color:#888">' + _esc(territory) + ' \u00b7 ' + entry.visitCount + ' visits</div>' +
          '<div style="font-size:10px;color:#00A6CE;margin-top:2px">' + storeLabel + '</div>' +
        '</div>' +
        '<div style="text-align:right;font-size:12px">' +
          '<b style="color:var(--green)">' + formatCurrency(entry.orderTotal) + '</b><br>' +
          '<span style="font-size:10px;color:#888">orders</span>' +
        '</div>' +
      '</div>';
    }

    container.innerHTML = html;

  } catch (err) {
    console.error('loadTSRLeaderboard:', err);
    if (container) container.innerHTML = '<div style="color:var(--pink);font-size:12px;padding:10px">Error loading leaderboard</div>';
  }
}

// ── Show TSR's assigned stores in a modal overlay ──

async function showTSRAssignedStores(tsrId, tsrName) {
  try {
    var stores = await getStoresByTSR(tsrId);

    // Remove existing modal
    var existing = document.getElementById('tsr-stores-modal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'tsr-stores-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.45);z-index:500;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);';
    modal.onclick = function (e) { if (e.target === modal) modal.remove(); };

    var card = '<div style="background:#fff;max-width:400px;width:90%;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.2);overflow:hidden;max-height:80vh;display:flex;flex-direction:column" onclick="event.stopPropagation()">';
    card += '<div style="background:#004D71;color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center">';
    card += '<div><div style="font-size:14px;font-weight:700">' + tsrName + '</div><div style="font-size:11px;opacity:0.8">' + stores.length + ' assigned stores</div></div>';
    card += '<button onclick="this.closest(\'#tsr-stores-modal\').remove()" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;padding:0 4px">&times;</button>';
    card += '</div>';
    card += '<div style="overflow-y:auto;flex:1">';

    if (stores.length === 0) {
      card += '<div style="text-align:center;color:#888;padding:24px;font-size:13px">Walang assigned stores</div>';
    } else {
      for (var i = 0; i < stores.length; i++) {
        var s = stores[i];
        var loc = s.city || s.province || s.region || '--';
        var hColor = s.health_status === 'crit' ? '#FA383E' : s.health_status === 'warn' ? '#F7B928' : '#31A24C';
        card += '<div style="padding:10px 18px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;gap:8px">';
        card += '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + hColor + ';flex-shrink:0"></span>';
        card += '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _esc(s.name) + '</div>';
        card += '<div style="font-size:11px;color:#888">' + _esc(loc) + '</div></div>';
        if (s.vol_class) {
          card += '<span style="background:#004D71;color:#fff;padding:1px 8px;border-radius:10px;font-size:10px;font-weight:700">Vol ' + s.vol_class + '</span>';
        }
        card += '</div>';
      }
    }

    card += '</div></div>';
    modal.innerHTML = card;
    document.body.appendChild(modal);

  } catch (err) {
    console.error('showTSRAssignedStores:', err);
  }
}

// ── 4. Segment Matrix ──

async function loadSegmentMatrix() {
  var container = document.getElementById('dsm-segment-matrix');
  if (!container) return;

  try {
    var stores = await getStores();

    // Segment name map: [vol_class][cov_class]
    var segmentNames = {
      'A-A': 'CHAMPION',   'A-B': 'GROW VOL',   'A-C': 'UNDERPERF',
      'B-A': 'CROSS-SELL',  'B-B': 'SOLID MID',   'B-C': 'NURTURE',
      'C-A': 'GOLDMINE',    'C-B': 'ENTRY',        'C-C': 'MONITOR'
    };

    var segmentColors = {
      'A-A': '#95C93D', 'A-B': '#00A6CE', 'A-C': '#F1B11D',
      'B-A': '#00A6CE', 'B-B': '#888',     'B-C': '#F1B11D',
      'C-A': '#95C93D', 'C-B': '#888',     'C-C': '#ccc'
    };

    // Count stores per cell
    var grid = {};
    var volClasses = ['A', 'B', 'C'];
    var covClasses = ['A', 'B', 'C'];

    for (var v = 0; v < volClasses.length; v++) {
      for (var c = 0; c < covClasses.length; c++) {
        grid[volClasses[v] + '-' + covClasses[c]] = 0;
      }
    }

    for (var s = 0; s < stores.length; s++) {
      var vol = stores[s].vol_class || 'C';
      var cov = stores[s].cov_class || 'C';
      var gKey = vol + '-' + cov;
      if (grid[gKey] !== undefined) {
        grid[gKey]++;
      }
    }

    // Render matrix
    var html = '<table style="width:100%;border-collapse:collapse;font-size:11px;text-align:center">';

    // Header row
    html += '<tr><td style="padding:4px;font-weight:700;color:#888;font-size:10px"></td>';
    for (var hc = 0; hc < covClasses.length; hc++) {
      html += '<td style="padding:4px;font-weight:700;color:#888;font-size:10px">Cov ' + covClasses[hc] + '</td>';
    }
    html += '</tr>';

    // Data rows
    for (var rv = 0; rv < volClasses.length; rv++) {
      html += '<tr>';
      html += '<td style="padding:4px;font-weight:700;color:#888;font-size:10px;white-space:nowrap">Vol ' + volClasses[rv] + '</td>';
      for (var rc = 0; rc < covClasses.length; rc++) {
        var cellKey = volClasses[rv] + '-' + covClasses[rc];
        var count = grid[cellKey];
        var segName = segmentNames[cellKey] || '';
        var segColor = segmentColors[cellKey] || '#888';

        html += '<td style="padding:8px 4px;border:1px solid #eee;border-radius:4px;background:' +
          (count > 0 ? segColor + '10' : '#fafafa') + '">' +
          '<div style="font-size:18px;font-weight:800;color:' + segColor + '">' + count + '</div>' +
          '<div style="font-size:9px;color:#888;margin-top:2px">' + segName + '</div>' +
        '</td>';
      }
      html += '</tr>';
    }

    html += '</table>';
    container.innerHTML = html;

  } catch (err) {
    console.error('loadSegmentMatrix:', err);
    if (container) container.innerHTML = '<div style="color:var(--pink);font-size:12px">Error loading matrix</div>';
  }
}

// ── 5. Critical Alerts ──

async function loadCriticalAlerts() {
  var container = document.getElementById('dsm-alerts');
  if (!container) return;

  try {
    var stores = await getStores();
    var now = Date.now();
    var fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    var alerts = [];

    for (var i = 0; i < stores.length; i++) {
      var s = stores[i];

      // Critical health status
      if (s.health_status === 'crit') {
        alerts.push({ store: s, reason: 'Critical health status \u2014 immediate action required' });
        continue;
      }

      // Vol A or B stores not visited in 14+ days
      var vol = (s.vol_class || '').toUpperCase();
      if (vol === 'A' || vol === 'B') {
        if (!s.last_visit_at) {
          alerts.push({ store: s, reason: 'Vol ' + vol + ' store \u2014 never visited' });
        } else {
          var lastVisit = new Date(s.last_visit_at).getTime();
          if (now - lastVisit > fourteenDaysMs) {
            var daysSince = Math.floor((now - lastVisit) / 86400000);
            alerts.push({ store: s, reason: 'Vol ' + vol + ' store \u2014 ' + daysSince + ' days since last visit' });
          }
        }
      }
    }

    if (alerts.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:#888;font-size:12px;padding:20px">No critical alerts \u2014 all clear</div>';
      return;
    }

    var html = '';
    for (var a = 0; a < alerts.length; a++) {
      var alert = alerts[a];
      var region = alert.store.region || alert.store.territory || '--';

      html += '<div style="padding:6px 0;border-bottom:1px solid #f0f0f0">' +
        '<b style="color:var(--pink)">\u26a0</b> <b>' + _esc(alert.store.name) + '</b> \u2014 ' + _esc(alert.reason) + '<br>' +
        '<span style="color:#888;font-size:11px">Territory: ' + _esc(region) + '</span>' +
      '</div>';
    }

    container.innerHTML = html;

  } catch (err) {
    console.error('loadCriticalAlerts:', err);
    if (container) container.innerHTML = '<div style="color:var(--pink);font-size:12px">Error loading alerts</div>';
  }
}

// ── 6. Product Penetration ──

async function loadProductPenetration() {
  var container = document.getElementById('dsm-product-pen');
  if (!container) return;

  try {
    var stores = await getStores();
    var totalStores = stores.length;

    if (totalStores === 0) {
      container.innerHTML = '<div style="text-align:center;color:#888;font-size:12px;padding:20px">No stores to analyze</div>';
      return;
    }

    // Collect all store IDs
    var storeIds = [];
    for (var i = 0; i < stores.length; i++) {
      storeIds.push(stores[i].id);
    }

    // Fetch all store_products that are Vienovo
    var { data: products, error } = await supabaseClient
      .from('store_products')
      .select('store_id, product_group')
      .eq('is_vienovo', true)
      .in('store_id', storeIds);

    if (error) throw new Error(error.message);
    products = products || [];

    // Count unique stores per product group
    var groups = ['hog', 'poultry', 'gamefowl', 'aqua', 'pet', 'dairy'];
    var groupLabels = {
      hog: 'Hog',
      poultry: 'Poultry',
      gamefowl: 'Gamefowl',
      aqua: 'Aqua',
      pet: 'Pet',
      dairy: 'Dairy'
    };
    var groupColors = {
      hog: '#004D71',
      poultry: '#00A6CE',
      gamefowl: '#F1B11D',
      aqua: '#00A6CE',
      pet: '#95C93D',
      dairy: '#888'
    };

    var groupStores = {};
    for (var g = 0; g < groups.length; g++) {
      groupStores[groups[g]] = {};
    }

    for (var p = 0; p < products.length; p++) {
      var pg = products[p].product_group;
      if (groupStores[pg]) {
        groupStores[pg][products[p].store_id] = true;
      }
    }

    // Render progress bars
    var html = '';
    for (var gi = 0; gi < groups.length; gi++) {
      var grp = groups[gi];
      var storeCount = Object.keys(groupStores[grp]).length;
      var pct = Math.round((storeCount / totalStores) * 100);
      var color = groupColors[grp] || '#888';

      html += '<div style="margin-bottom:10px">' +
        '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">' +
          '<span style="font-weight:600">' + groupLabels[grp] + '</span>' +
          '<span style="color:#888">' + storeCount + '/' + totalStores + ' (' + pct + '%)</span>' +
        '</div>' +
        '<div style="height:8px;background:#eee;border-radius:4px;overflow:hidden">' +
          '<div style="width:' + pct + '%;height:100%;background:' + color + ';border-radius:4px;transition:width 0.5s"></div>' +
        '</div>' +
      '</div>';
    }

    container.innerHTML = html;

  } catch (err) {
    console.error('loadProductPenetration:', err);
    if (container) container.innerHTML = '<div style="color:var(--pink);font-size:12px">Error loading penetration data</div>';
  }
}

// ── 7. Master Init ──

async function initDashboard() {
  var session = getSession();
  if (!session) return;

  // Only DSM, RSM, or Admin can access dashboard
  if (['dsm', 'rsm', 'admin'].indexOf(session.role) === -1) {
    console.warn('initDashboard: role "' + session.role + '" not authorized');
    return;
  }

  // Set subtitle
  var subtitleEl = document.getElementById('dsm-subtitle');
  if (subtitleEl) {
    subtitleEl.textContent = (session.district || session.region || 'All Territories') + ' \u00b7 ' + session.name;
  }

  // Run all loads in parallel
  await Promise.all([
    loadDashboardKPIs(),
    loadVisitChart(),
    loadTSRLeaderboard(),
    loadSegmentMatrix(),
    loadCriticalAlerts(),
    loadProductPenetration()
  ]);
}
