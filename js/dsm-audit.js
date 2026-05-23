// DSM Audit Flags Module — Sprint B-DSM
// Detects suspicious/quality-control patterns across the DSM's TSR team over the
// last 7 days. Produces up to 4 flags ranked by severity.
//
// Flag types:
//   gps-cluster      — 3+ visits same day by same TSR with GPS within 100m (potential fake visits)   [critical]
//   missing-photo    — visits where photo_url is NULL                                                [warn]
//   short-duration   — visits where duration_mins < 5                                                [warn]
//   repeat-visit     — same store visited 4+ times in 1 week by one TSR (unusual)                    [warn]

(function () {
  var LOOKBACK_DAYS = 7;
  var GPS_CLUSTER_RADIUS_M = 100;
  var GPS_CLUSTER_MIN_VISITS = 3;
  var SHORT_DURATION_MIN = 5;
  var REPEAT_VISIT_THRESHOLD = 4;
  var MAX_FLAGS = 4;

  // Delegates to canonical PatrolEscape.escapeHtml (js/_util/escape.js).
  function _daEsc(s) {
    return (typeof PatrolEscape !== 'undefined') ? PatrolEscape.escapeHtml(s) : (s == null ? '' : String(s));
  }

  // Haversine distance in meters
  function _distMeters(lat1, lng1, lat2, lng2) {
    if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return Infinity;
    var R = 6371000;
    var toRad = function (d) { return d * Math.PI / 180; };
    var dLat = toRad(lat2 - lat1);
    var dLng = toRad(lng2 - lng1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function _dayKey(iso) {
    if (!iso) return '';
    return String(iso).slice(0, 10); // YYYY-MM-DD
  }

  function _fmtDay(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
    } catch (e) { return _dayKey(iso); }
  }

  // Fetch audit source data. Consolidated into ONE Supabase query per TSR team
  // (re-uses the caller's TSR list — no N+1).
  async function fetchAuditData(tsrIds) {
    if (!tsrIds || tsrIds.length === 0) return { visits: [] };
    var since = new Date();
    since.setDate(since.getDate() - LOOKBACK_DAYS);
    var sinceIso = since.toISOString();

    var res = await supabaseClient
      .from('visits')
      .select('id,tsr_id,store_id,lat,lng,photo_url,duration_mins,visited_at')
      .in('tsr_id', tsrIds)
      .gte('visited_at', sinceIso)
      .order('visited_at', { ascending: false });

    return { visits: (res && res.data) || [] };
  }

  // Given visit rows + a tsrId→name map, return an array of audit flags.
  function detectAuditFlags(visits, tsrNameById, storeNameById) {
    tsrNameById = tsrNameById || {};
    storeNameById = storeNameById || {};
    var flags = [];

    // Group visits by TSR
    var byTsr = {};
    for (var i = 0; i < visits.length; i++) {
      var v = visits[i];
      if (!v.tsr_id) continue;
      (byTsr[v.tsr_id] = byTsr[v.tsr_id] || []).push(v);
    }

    Object.keys(byTsr).forEach(function (tsrId) {
      var tsrVisits = byTsr[tsrId];
      var tsrName = tsrNameById[tsrId] || 'Unknown TSR';

      // ── Flag 1: GPS clustering (critical) ──
      // Group by day, then check if 3+ visits within 100m of each other.
      var byDay = {};
      tsrVisits.forEach(function (v) {
        var k = _dayKey(v.visited_at);
        if (!k) return;
        (byDay[k] = byDay[k] || []).push(v);
      });
      Object.keys(byDay).forEach(function (day) {
        var dayVisits = byDay[day].filter(function (v) { return v.lat != null && v.lng != null; });
        if (dayVisits.length < GPS_CLUSTER_MIN_VISITS) return;
        // Naive O(n^2) cluster: if any anchor has ≥3 visits within radius, flag it.
        for (var a = 0; a < dayVisits.length; a++) {
          var anchor = dayVisits[a];
          var near = 1;
          for (var b = 0; b < dayVisits.length; b++) {
            if (b === a) continue;
            if (_distMeters(anchor.lat, anchor.lng, dayVisits[b].lat, dayVisits[b].lng) <= GPS_CLUSTER_RADIUS_M) {
              near++;
            }
          }
          if (near >= GPS_CLUSTER_MIN_VISITS) {
            flags.push({
              severity: 'critical',
              type: 'gps-cluster',
              tsr_id: tsrId,
              text: near + ' visits same day (' + _fmtDay(anchor.visited_at) + ') \u00b7 GPS clustered within ' + GPS_CLUSTER_RADIUS_M + 'm',
              tsr_name: tsrName,
              icon: '\u26a0\ufe0f',
              sort: 100
            });
            return; // one cluster flag per TSR per audit pass
          }
        }
      });

      // ── Flag 2: Missing photos ──
      var noPhoto = tsrVisits.filter(function (v) { return !v.photo_url; }).length;
      if (noPhoto >= 2) {
        flags.push({
          severity: 'warn',
          type: 'missing-photo',
          tsr_id: tsrId,
          text: noPhoto + ' visits missing mandatory photo (last ' + LOOKBACK_DAYS + ' days)',
          tsr_name: tsrName,
          icon: '\ud83d\udcf8',
          sort: 50 + noPhoto
        });
      }

      // ── Flag 3: Short-duration visits ──
      var shortVisits = tsrVisits.filter(function (v) {
        return v.duration_mins != null && v.duration_mins > 0 && v.duration_mins < SHORT_DURATION_MIN;
      });
      if (shortVisits.length >= 3) {
        var avg = shortVisits.reduce(function (s, v) { return s + v.duration_mins; }, 0) / shortVisits.length;
        flags.push({
          severity: 'warn',
          type: 'short-duration',
          tsr_id: tsrId,
          text: shortVisits.length + ' visits under ' + SHORT_DURATION_MIN + ' min \u00b7 avg ' + avg.toFixed(1) + ' min',
          tsr_name: tsrName,
          icon: '\u23f0',
          sort: 40 + shortVisits.length
        });
      }

      // ── Flag 4: Repeat visits same store ──
      var byStore = {};
      tsrVisits.forEach(function (v) {
        if (!v.store_id) return;
        byStore[v.store_id] = (byStore[v.store_id] || 0) + 1;
      });
      Object.keys(byStore).forEach(function (storeId) {
        if (byStore[storeId] >= REPEAT_VISIT_THRESHOLD) {
          var storeName = storeNameById[storeId] || 'one store';
          flags.push({
            severity: 'warn',
            type: 'repeat-visit',
            tsr_id: tsrId,
            text: _daEsc(storeName) + ' visited ' + byStore[storeId] + 'x this week \u2014 why?',
            tsr_name: tsrName,
            icon: '\ud83d\udd01',
            sort: 30 + byStore[storeId]
          });
        }
      });
    });

    // Sort: critical first, then by sort desc
    flags.sort(function (a, b) {
      if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
      return b.sort - a.sort;
    });
    return flags.slice(0, MAX_FLAGS);
  }

  function renderAuditFlags(flags) {
    if (!flags || flags.length === 0) {
      return '<div class="audit-flag-clean">\u2705 Walang audit flags this week \u2014 clean run.</div>';
    }
    var out = '';
    for (var i = 0; i < flags.length; i++) {
      var f = flags[i];
      out += '<div class="audit-flag' + (f.severity === 'critical' ? ' critical' : '') + '">' +
        '<div class="audit-flag-icon">' + f.icon + '</div>' +
        '<div class="audit-flag-body">' +
          '<div class="audit-flag-who">' + _daEsc(f.tsr_name) + '</div>' +
          f.text +
        '</div>' +
      '</div>';
    }
    return out;
  }

  // Build a { tsr_id: [flag, ...] } map — used by coaching cards to mark TSRs with
  // critical flags so they auto-route to urgent coaching cards.
  function flagsByTsr(flags) {
    var m = {};
    (flags || []).forEach(function (f) {
      (m[f.tsr_id] = m[f.tsr_id] || []).push(f);
    });
    return m;
  }

  window.fetchAuditData = fetchAuditData;
  window.detectAuditFlags = detectAuditFlags;
  window.renderAuditFlags = renderAuditFlags;
  window.flagsByTsrId = flagsByTsr;
})();
