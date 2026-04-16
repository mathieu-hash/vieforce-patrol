// VieForce Patrol — Export Module (client-side Excel generation)
// Uses SheetJS (xlsx) loaded from CDN
// DSM/Admin only — wired to dashboard export buttons

var ExportModule = (function() {
  'use strict';

  // --- Helpers ---
  function formatDate(d) {
    if (!d) return '--';
    var dt = new Date(d);
    return dt.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function showExportStatus(msg) {
    var el = document.getElementById('export-status');
    if (el) {
      el.textContent = msg;
      el.style.display = msg ? 'block' : 'none';
    }
  }

  // --- Export Visits (Excel) ---
  async function exportVisits() {
    showExportStatus('Ginagawa ang file... sandali lang');
    try {
      var session = getSession();
      if (!session) throw new Error('Not authenticated');

      // Fetch visits with store join
      var query = supabaseClient
        .from('visits')
        .select('*, stores:store_id(name, address, city, province)')
        .order('visited_at', { ascending: false });

      // Fetch TSR names
      var usersRes = await supabaseClient.from('users').select('id, name');
      var userMap = {};
      if (usersRes.data) {
        usersRes.data.forEach(function(u) { userMap[u.id] = u.name; });
      }

      var res = await query;
      if (res.error) throw res.error;
      var visits = res.data || [];

      // Build worksheet data
      var wsData = [
        ['TSR Name', 'Store Name', 'Location', 'Visit Date', 'Visit Type',
         'Outcome', 'Order Amount', 'Bags', 'Photo', 'Sync Status', 'Notes']
      ];

      visits.forEach(function(v) {
        var storeName = (v.stores && v.stores.name) ? v.stores.name : '--';
        var location = '';
        if (v.stores) {
          var parts = [];
          if (v.stores.city) parts.push(v.stores.city);
          if (v.stores.province) parts.push(v.stores.province);
          location = parts.join(', ');
        }
        var outcome = v.order_taken ? 'Order' : 'No Order';
        wsData.push([
          userMap[v.tsr_id] || v.tsr_id || '--',
          storeName,
          location || '--',
          formatDate(v.visited_at),
          (v.visit_type || 'regular'),
          outcome,
          v.order_taken ? parseFloat(v.order_amount || 0) : 0,
          '', // bags not stored per-visit currently
          v.photo_url ? 'Y' : 'N',
          v.synced_at ? 'Synced' : 'Pending',
          v.notes || ''
        ]);
      });

      var wb = XLSX.utils.book_new();
      var ws = XLSX.utils.aoa_to_sheet(wsData);

      // Column widths
      ws['!cols'] = [
        { wch: 20 }, { wch: 25 }, { wch: 25 }, { wch: 14 },
        { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 8 },
        { wch: 6 }, { wch: 10 }, { wch: 30 }
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Visits');

      var now = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, 'Patrol_Visits_' + now + '.xlsx');
      showExportStatus('');
    } catch (err) {
      showExportStatus('Error: ' + err.message);
      setTimeout(function() { showExportStatus(''); }, 5000);
    }
  }

  // --- Export Stores (Excel) ---
  async function exportStores() {
    showExportStatus('Ginagawa ang file... sandali lang');
    try {
      var session = getSession();
      if (!session) throw new Error('Not authenticated');

      // Fetch all stores
      var res = await supabaseClient
        .from('stores')
        .select('*')
        .order('name');
      if (res.error) throw res.error;
      var stores = res.data || [];

      // Fetch TSR names for assigned_tsr / created_by
      var usersRes = await supabaseClient.from('users').select('id, name');
      var userMap = {};
      if (usersRes.data) {
        usersRes.data.forEach(function(u) { userMap[u.id] = u.name; });
      }

      // Fetch visit counts per store
      var visitsRes = await supabaseClient
        .from('visits')
        .select('store_id, order_amount, visited_at');
      var visitCounts = {};
      var lastVisitMap = {};
      if (visitsRes.data) {
        visitsRes.data.forEach(function(v) {
          visitCounts[v.store_id] = (visitCounts[v.store_id] || 0) + 1;
          var vDate = new Date(v.visited_at);
          if (!lastVisitMap[v.store_id] || vDate > lastVisitMap[v.store_id]) {
            lastVisitMap[v.store_id] = vDate;
          }
        });
      }

      var wsData = [
        ['Store Name', 'Owner', 'Phone', 'Address', 'City', 'Region',
         'Vol Class', 'Cov Class', 'Segment', 'Assigned TSR',
         'Last Visit', 'Total Visits', 'Avg Bags/Month']
      ];

      stores.forEach(function(s) {
        var assignedTsr = s.assigned_tsr ? userMap[s.assigned_tsr] : (s.created_by ? userMap[s.created_by] : '--');
        var lastVisit = s.last_visit_at ? formatDate(s.last_visit_at) :
                        (lastVisitMap[s.id] ? formatDate(lastVisitMap[s.id]) : '--');

        wsData.push([
          s.name || '--',
          s.owner_name || '--',
          s.phone || '--',
          s.address || '--',
          s.city || '--',
          s.region || '--',
          s.vol_class || '--',
          s.cov_class || '--',
          s.segment || '--',
          assignedTsr || '--',
          lastVisit,
          visitCounts[s.id] || 0,
          s.bags_per_month || 0
        ]);
      });

      var wb = XLSX.utils.book_new();
      var ws = XLSX.utils.aoa_to_sheet(wsData);

      ws['!cols'] = [
        { wch: 25 }, { wch: 18 }, { wch: 14 }, { wch: 30 }, { wch: 15 },
        { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 20 },
        { wch: 14 }, { wch: 12 }, { wch: 14 }
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Stores');

      var now = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, 'Patrol_Stores_' + now + '.xlsx');
      showExportStatus('');
    } catch (err) {
      showExportStatus('Error: ' + err.message);
      setTimeout(function() { showExportStatus(''); }, 5000);
    }
  }

  // --- Export Summary (Excel) ---
  async function exportSummary() {
    showExportStatus('Ginagawa ang file... sandali lang');
    try {
      var session = getSession();
      if (!session) throw new Error('Not authenticated');

      // Fetch stores
      var storesRes = await supabaseClient.from('stores').select('*');
      if (storesRes.error) throw storesRes.error;
      var stores = storesRes.data || [];

      // Fetch visits (this month)
      var now = new Date();
      var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      var visitsRes = await supabaseClient
        .from('visits')
        .select('*')
        .gte('visited_at', monthStart)
        .order('visited_at', { ascending: false });
      if (visitsRes.error) throw visitsRes.error;
      var visits = visitsRes.data || [];

      // Fetch users (TSRs)
      var usersRes = await supabaseClient
        .from('users')
        .select('*')
        .eq('role', 'tsr')
        .eq('is_active', true);
      var tsrs = (usersRes.data || []);
      var userMap = {};
      tsrs.forEach(function(u) { userMap[u.id] = u; });

      var wb = XLSX.utils.book_new();

      // --- Sheet 1: KPIs ---
      var totalStores = stores.length;
      var critStores = stores.filter(function(s) { return s.health_status === 'crit'; }).length;
      var warnStores = stores.filter(function(s) { return s.health_status === 'warn'; }).length;
      var totalVisits = visits.length;
      var orderVisits = visits.filter(function(v) { return v.order_taken; });
      var totalOrderAmount = orderVisits.reduce(function(sum, v) { return sum + parseFloat(v.order_amount || 0); }, 0);

      var kpiData = [
        ['VieForce Patrol — Monthly Summary'],
        ['Generated', new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })],
        [],
        ['KPI', 'Value'],
        ['Total Stores', totalStores],
        ['Critical Stores', critStores],
        ['Warning Stores', warnStores],
        ['OK Stores', totalStores - critStores - warnStores],
        ['Visits (MTD)', totalVisits],
        ['Orders (MTD)', orderVisits.length],
        ['Total Order Amount (MTD)', totalOrderAmount],
        ['Active TSRs', tsrs.length]
      ];
      var wsKpi = XLSX.utils.aoa_to_sheet(kpiData);
      wsKpi['!cols'] = [{ wch: 25 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, wsKpi, 'KPIs');

      // --- Sheet 2: TSR Leaderboard (top performers only) ---
      var tsrVisits = {};
      var tsrOrders = {};
      visits.forEach(function(v) {
        tsrVisits[v.tsr_id] = (tsrVisits[v.tsr_id] || 0) + 1;
        if (v.order_taken) {
          tsrOrders[v.tsr_id] = (tsrOrders[v.tsr_id] || 0) + parseFloat(v.order_amount || 0);
        }
      });

      var leaderboard = tsrs.map(function(t) {
        return {
          name: t.name,
          territory: t.territory || t.district || '--',
          visits: tsrVisits[t.id] || 0,
          orderTotal: tsrOrders[t.id] || 0
        };
      }).sort(function(a, b) { return b.visits - a.visits; });

      // Top performers only (per Rule 10 — never expose low performers)
      var topN = Math.min(leaderboard.length, 10);

      var lbData = [
        ['TSR Leaderboard — Top Performers (MTD)'],
        [],
        ['Rank', 'TSR Name', 'Territory', 'Visits', 'Order Total (PHP)']
      ];
      for (var i = 0; i < topN; i++) {
        var t = leaderboard[i];
        lbData.push([i + 1, t.name, t.territory, t.visits, t.orderTotal]);
      }
      var wsLb = XLSX.utils.aoa_to_sheet(lbData);
      wsLb['!cols'] = [{ wch: 6 }, { wch: 20 }, { wch: 18 }, { wch: 8 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, wsLb, 'Leaderboard');

      // --- Sheet 3: Segment Distribution ---
      var segCounts = {};
      stores.forEach(function(s) {
        var seg = s.segment || 'Unclassified';
        segCounts[seg] = (segCounts[seg] || 0) + 1;
      });

      var segData = [
        ['Store Segment Distribution'],
        [],
        ['Segment', 'Count', '% of Total']
      ];
      Object.keys(segCounts).sort().forEach(function(seg) {
        var count = segCounts[seg];
        var pct = totalStores > 0 ? Math.round((count / totalStores) * 100) : 0;
        segData.push([seg, count, pct + '%']);
      });
      var wsSeg = XLSX.utils.aoa_to_sheet(segData);
      wsSeg['!cols'] = [{ wch: 20 }, { wch: 8 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, wsSeg, 'Segments');

      // --- Sheet 4: Coverage Map Table ---
      var covData = [
        ['Store Coverage Map'],
        [],
        ['Store Name', 'City', 'Vol Class', 'Health', 'Last Visit', 'Total Visits (MTD)']
      ];
      var storeVisitCounts = {};
      visits.forEach(function(v) {
        storeVisitCounts[v.store_id] = (storeVisitCounts[v.store_id] || 0) + 1;
      });
      stores.sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); })
        .forEach(function(s) {
          covData.push([
            s.name || '--',
            s.city || '--',
            s.vol_class || '--',
            s.health_status || '--',
            formatDate(s.last_visit_at),
            storeVisitCounts[s.id] || 0
          ]);
        });
      var wsCov = XLSX.utils.aoa_to_sheet(covData);
      wsCov['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, wsCov, 'Coverage');

      var dateStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, 'Patrol_Summary_' + dateStr + '.xlsx');
      showExportStatus('');
    } catch (err) {
      showExportStatus('Error: ' + err.message);
      setTimeout(function() { showExportStatus(''); }, 5000);
    }
  }

  // Public API
  return {
    exportVisits: exportVisits,
    exportStores: exportStores,
    exportSummary: exportSummary
  };
})();
