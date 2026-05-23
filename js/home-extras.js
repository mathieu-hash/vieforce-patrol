// TSR Elite Upgrade — Sprint B-TSR
// Next Best Action hero + Streak counter for the TSR home page.
// Reads from getStores() + getVisitsByTSR(). Pure read, no writes.

// Delegates to canonical PatrolEscape.escapeHtml (js/_util/escape.js).
function _hxEsc(s) {
  return (typeof PatrolEscape !== 'undefined') ? PatrolEscape.escapeHtml(s) : (s == null ? '' : String(s));
}

function _hxDaysSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

// ── NEXT BEST ACTION ──────────────────────────────────────────────────────────
// score(store) → highest priority store the TSR should visit right now.
function _nbaScore(s) {
  var score = 0;
  if (s.risk_status === 'at_risk') score += 30;
  if (s.risk_status === 'lost')    score += 50;

  var d = _hxDaysSince(s.last_visit_at);
  if (d != null) {
    if (d > 60)      score += 40;
    else if (d > 30) score += 20;
    else if (d > 14) score += 10;
  } else {
    score += 25; // never visited — still important
  }

  if (s.vol_class === 'A') score += 15;
  else if (s.vol_class === 'B') score += 8;

  if (s.store_status === 'prospect') {
    var dStage = _hxDaysSince(s.created_at);
    if (dStage != null && dStage > 14) score += 25;
  }

  var mtd = parseFloat(s.mtd_volume_mt) || 0;
  var prev = parseFloat(s.prev_month_volume_mt) || 0;
  if (prev > 0 && mtd < prev * 0.7) score += 20;

  return score;
}

function _nbaReason(s) {
  var d = _hxDaysSince(s.last_visit_at);
  var mtd = parseFloat(s.mtd_volume_mt) || 0;
  var prev = parseFloat(s.prev_month_volume_mt) || 0;

  if (s.risk_status === 'at_risk' && d != null && d > 30) {
    return 'At-risk \u00b7 ' + d + ' days no visit';
  }
  if (s.risk_status === 'lost') {
    return 'Recovery \u00b7 walang order ' + (d != null ? d + ' days' : 'matagal na') + ' \u00b7 was top customer';
  }
  if (s.store_status === 'prospect') {
    var dStage = _hxDaysSince(s.created_at);
    if (dStage != null && dStage > 14) {
      return 'Prospect na ' + dStage + ' days \u00b7 hindi pa converted';
    }
    return 'Prospect \u00b7 follow-up needed';
  }
  if (prev > 0 && mtd < prev * 0.7) {
    var pct = Math.round(((prev - mtd) / prev) * 100);
    return 'Declining account \u00b7 MoM volume -' + pct + '%';
  }
  if (d != null) return 'Routine visit \u00b7 last seen ' + d + ' days ago';
  return 'Never visited \u00b7 introduce yourself';
}

function _nbaSkippedToday(storeId) {
  var key = 'patrol_nba_skip_' + new Date().toISOString().slice(0, 10);
  var skipped = (localStorage.getItem(key) || '').split(',');
  return skipped.indexOf(storeId) !== -1;
}

function skipNba() {
  var key = 'patrol_nba_skip_' + new Date().toISOString().slice(0, 10);
  var current = (localStorage.getItem(key) || '').split(',').filter(Boolean);
  if (window._nbaCurrentId && current.indexOf(window._nbaCurrentId) === -1) {
    current.push(window._nbaCurrentId);
    localStorage.setItem(key, current.join(','));
  }
  renderNbaHero();
}
window.skipNba = skipNba;

async function renderNbaHero() {
  var session = getSession();
  if (!session) return;
  if (session.role !== 'tsr' && session.role !== 'champion') return;

  var container = document.getElementById('tsr-nba-container');
  if (!container) return;

  try {
    var stores = await getStores();
    if (!stores || stores.length === 0) {
      container.innerHTML = '';
      return;
    }
    var ranked = stores
      .filter(function (s) { return !_nbaSkippedToday(s.id); })
      .map(function (s) { return { s: s, score: _nbaScore(s) }; })
      .sort(function (a, b) { return b.score - a.score; });

    if (ranked.length === 0 || ranked[0].score < 5) {
      // Nothing urgent — render a quiet "all clear" pill
      container.innerHTML =
        '<div class="nba-hero" style="background:linear-gradient(135deg,#7EB87E,#16A34A);box-shadow:0 8px 24px rgba(126,184,126,0.25)">' +
          '<div class="nba-label">\u2728 LAHAT OK</div>' +
          '<div class="nba-title">Walang urgent na bisita ngayon</div>' +
          '<div class="nba-reason">Continue with your routine route. Magaling ka! \ud83d\udcaa</div>' +
        '</div>';
      window._nbaCurrentId = null;
      return;
    }

    var top = ranked[0].s;
    window._nbaCurrentId = top.id;

    var mtd = parseFloat(top.mtd_volume_mt) || 0;
    var bags = top.bags_per_month || 0;
    var meta = [];
    if (top.city) meta.push('\ud83d\udccd ' + _hxEsc(top.city));
    if (mtd > 0) meta.push('\ud83d\udcb0 \u20b1' + Math.round(mtd * 1000).toLocaleString() + ' MTD');
    else if (bags > 0) meta.push('\ud83d\udce6 ' + bags + ' bags/buwan');

    container.innerHTML =
      '<div class="nba-hero">' +
        '<div class="nba-label">\ud83c\udfaf ' + (T.nbaLabel || 'ANG UNANG BISITA MO NGAYON') + '</div>' +
        '<div class="nba-title">' + _hxEsc(top.name) + '</div>' +
        '<div class="nba-meta">' + meta.join('') + '</div>' +
        '<div class="nba-reason">' + _hxEsc(_nbaReason(top)) + '</div>' +
        '<div class="nba-actions">' +
          '<div class="nba-btn" onclick="openStoreDetail(\'' + _hxEsc(top.id) + '\')">\ud83d\ude80 ' + (T.nbaGo || 'GO NGAYON') + '</div>' +
          '<div class="nba-btn secondary" onclick="skipNba()">' + (T.nbaSkip || 'Skip') + '</div>' +
        '</div>' +
      '</div>';
  } catch (e) {
    console.warn('renderNbaHero:', e);
    container.innerHTML = '';
  }
}
window.renderNbaHero = renderNbaHero;

// ── STREAK COUNTER ────────────────────────────────────────────────────────────
// Counts consecutive days (most recent backwards) with at least 1 visit.
async function renderStreakCard() {
  var session = getSession();
  if (!session) return;
  if (session.role !== 'tsr' && session.role !== 'champion') return;

  var container = document.getElementById('tsr-streak-container');
  if (!container) return;

  try {
    // Pull last 70 days of visits — enough for a Legend (60) + buffer
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 70);
    var visits = await getVisitsByTSR(session.id, cutoff.toISOString());

    var dayHas = {}; // YYYY-MM-DD -> 1
    (visits || []).forEach(function (v) {
      if (v && v.visited_at) dayHas[String(v.visited_at).slice(0, 10)] = 1;
    });

    // Walk backwards from today until we hit a gap. Count consecutive days.
    var streak = 0;
    var d = new Date();
    while (true) {
      var key = d.toISOString().slice(0, 10);
      if (dayHas[key]) {
        streak++;
        d.setDate(d.getDate() - 1);
        if (streak >= 70) break;
      } else if (streak === 0) {
        // Allow today to be empty — start counting from yesterday so we don't
        // wipe the streak just because the day isn't done.
        d.setDate(d.getDate() - 1);
        if (d.getTime() < cutoff.getTime()) break;
        // But only allow ONE empty day at the head (today).
        var nextKey = d.toISOString().slice(0, 10);
        if (!dayHas[nextKey]) break;
      } else {
        break;
      }
    }

    var html;
    if (streak === 0) {
      html =
        '<div class="streak-card zero">' +
          '<div class="streak-emoji">\ud83d\udd25</div>' +
          '<div class="streak-info">' +
            '<div class="streak-num">' + (T.streakStart || 'Magsimula ng streak!') + '</div>' +
            '<div class="streak-label">' + (T.streakLabel || 'Visit streak') + '</div>' +
            '<div class="streak-progress">' + (T.streakStartHint || 'Mag-log ng visit ngayon \ud83d\udd25') + '</div>' +
          '</div>' +
        '</div>';
    } else {
      var BADGES = [
        { d: 7,  name: T.badgeReliable || 'Reliable TSR' },
        { d: 14, name: T.badgeIron     || 'Iron TSR' },
        { d: 30, name: T.badgeElite    || 'Elite TSR' },
        { d: 60, name: T.badgeLegend   || 'Legend TSR' }
      ];
      var nextBadge = null;
      for (var i = 0; i < BADGES.length; i++) {
        if (streak < BADGES[i].d) { nextBadge = BADGES[i]; break; }
      }
      var earned = null;
      for (var j = BADGES.length - 1; j >= 0; j--) {
        if (streak >= BADGES[j].d) { earned = BADGES[j]; break; }
      }
      var progress;
      if (nextBadge) {
        progress = (nextBadge.d - streak) + ' ' + (T.streakDaysTo || 'more days') +
          ' \u2192 "' + _hxEsc(nextBadge.name) + '"';
      } else {
        progress = '\ud83c\udfc6 ' + (T.streakLegendary || 'Legendary streak — keep going!');
      }
      html =
        '<div class="streak-card">' +
          '<div class="streak-emoji">\ud83d\udd25</div>' +
          '<div class="streak-info">' +
            '<div class="streak-num">' + streak + '-' + (T.streakDays || 'Day Streak!') + '</div>' +
            '<div class="streak-label">' + (T.streakLabel || 'Visit streak') +
              (earned ? ' \u00b7 ' + _hxEsc(earned.name) : '') +
            '</div>' +
            '<div class="streak-progress">' + progress + '</div>' +
          '</div>' +
        '</div>';
    }
    container.innerHTML = html;
  } catch (e) {
    console.warn('renderStreakCard:', e);
    container.innerHTML = '';
  }
}
window.renderStreakCard = renderStreakCard;
