// Champion + Leaderboard Module — TSR home screen widgets
// Champion: sees team daily progress. All TSRs: see top 3 + own rank.
// Uses T.* labels throughout. Read-only — champion cannot edit other TSRs' data.

// ── Escape helper ──

function _champEsc(str) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str || ''));
  return div.innerHTML;
}

// ── Initialize both widgets ──

async function initChampionWidgets() {
  var session = getSession();
  if (!session) return;

  // Only TSRs see these widgets (DSM+ has their own dashboard)
  if (session.role !== 'tsr') return;

  // Run both in parallel
  var promises = [loadLeaderboardWidget(session)];

  if (session.is_champion) {
    promises.push(loadChampionTeamWidget(session));
  }

  await Promise.all(promises);
}

// ═══════════════════════════════════════════════════
// CHAMPION TEAM WIDGET — "Koponan mo ngayon"
// ═══════════════════════════════════════════════════

async function loadChampionTeamWidget(session) {
  var container = document.getElementById('home-champion-widget');
  if (!container) return;

  try {
    var team = await getChampionTeam(session.district);

    if (!team || team.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';

    var html = '<div style="background:var(--bg-main);border-radius:var(--radius);overflow:hidden;border:1px solid #E4E6EB">';

    // Header
    html += '<div style="padding:12px 16px;border-bottom:1px solid #E4E6EB;display:flex;align-items:center;justify-content:space-between">';
    html += '<div style="font-size:15px;font-weight:700;color:var(--text-primary)">' + _champEsc(T.teamToday) + '</div>';
    html += '<div style="font-size:11px;color:var(--text-muted)">' + team.length + ' TSR' + (team.length !== 1 ? 's' : '') + '</div>';
    html += '</div>';

    // Team rows with progress bars
    for (var i = 0; i < team.length; i++) {
      var tsr = team[i];
      var pct = tsr.targetVisits > 0 ? Math.min(100, Math.round((tsr.visitsThisWeek / tsr.targetVisits) * 100)) : 0;
      var isComplete = tsr.visitsThisWeek >= tsr.targetVisits;
      var barColor = isComplete ? '#95C93D' : (pct >= 50 ? '#95C93D' : (pct >= 25 ? '#F7B928' : '#E4E6EB'));

      // First letter for avatar
      var initial = tsr.name ? tsr.name.charAt(0).toUpperCase() : '?';

      html += '<div class="champ-team-row" onclick="showChampionTSRStores(\'' + tsr.id + '\',\'' + _champEsc(tsr.name).replace(/'/g, "\\'") + '\')" ' +
        'style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid #f0f0f0;cursor:pointer;min-height:56px">';

      // Avatar circle
      html += '<div style="width:36px;height:36px;border-radius:50%;background:' +
        (isComplete ? '#95C93D' : 'var(--accent)') +
        ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0">' +
        initial + '</div>';

      // Name + progress bar
      html += '<div style="flex:1;min-width:0">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">';
      html += '<span style="font-size:14px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _champEsc(tsr.name) + '</span>';
      html += '<span style="font-size:12px;font-weight:600;color:' + (isComplete ? '#95C93D' : 'var(--text-secondary)') + ';flex-shrink:0;margin-left:8px">' +
        T.visitsOf(tsr.visitsThisWeek, tsr.targetVisits) + '</span>';
      html += '</div>';

      // Progress bar
      html += '<div style="height:8px;background:#E4E6EB;border-radius:4px;overflow:hidden">';
      html += '<div style="width:' + pct + '%;height:100%;background:' + barColor + ';border-radius:4px;transition:width 0.5s ease"></div>';
      html += '</div>';

      html += '</div>'; // end name+bar
      html += '</div>'; // end row
    }

    html += '</div>'; // end card
    container.innerHTML = html;

  } catch (err) {
    console.error('loadChampionTeamWidget:', err);
    container.style.display = 'none';
  }
}

// ── Show TSR's assigned stores (read-only modal) ──

async function showChampionTSRStores(tsrId, tsrName) {
  try {
    var stores = await getStoresByTSR(tsrId);

    var existing = document.getElementById('champ-stores-modal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'champ-stores-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);z-index:500;display:flex;align-items:flex-end;justify-content:center;';
    modal.onclick = function (e) { if (e.target === modal) modal.remove(); };

    var card = '<div style="background:#fff;width:100%;max-width:480px;border-radius:16px 16px 0 0;box-shadow:0 -4px 24px rgba(0,0,0,0.15);max-height:70vh;display:flex;flex-direction:column" onclick="event.stopPropagation()">';

    // Drag handle
    card += '<div style="text-align:center;padding:8px 0"><div style="width:40px;height:4px;border-radius:2px;background:#ccc;margin:0 auto"></div></div>';

    // Header
    card += '<div style="padding:8px 20px 12px;display:flex;justify-content:space-between;align-items:center">';
    card += '<div><div style="font-size:16px;font-weight:700;color:var(--text-primary)">' + _champEsc(tsrName) + '</div>';
    card += '<div style="font-size:12px;color:var(--text-muted)">' + T.assignedStores(stores.length) + '</div></div>';
    card += '<button onclick="this.closest(\'#champ-stores-modal\').remove()" style="background:none;border:none;font-size:22px;color:var(--text-muted);cursor:pointer;padding:4px">&times;</button>';
    card += '</div>';

    // Store list
    card += '<div style="overflow-y:auto;flex:1;border-top:1px solid #E4E6EB">';

    if (stores.length === 0) {
      card += '<div style="text-align:center;color:var(--text-muted);padding:32px;font-size:14px">' + T.noStores + '</div>';
    } else {
      for (var i = 0; i < stores.length; i++) {
        var s = stores[i];
        var loc = s.city || s.province || s.region || '--';
        var hColor = s.health_status === 'crit' ? '#FA383E' : s.health_status === 'warn' ? '#F7B928' : '#31A24C';

        card += '<div style="display:flex;align-items:center;gap:10px;padding:12px 20px;border-bottom:1px solid #f0f0f0;min-height:48px">';
        card += '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + hColor + ';flex-shrink:0"></span>';
        card += '<div style="flex:1;min-width:0">';
        card += '<div style="font-size:14px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _champEsc(s.name) + '</div>';
        card += '<div style="font-size:12px;color:var(--text-muted)">' + _champEsc(loc) + '</div>';
        card += '</div>';
        if (s.vol_class) {
          var vBg = s.vol_class === 'A' ? 'var(--accent-dark)' : s.vol_class === 'B' ? 'var(--accent)' : '#888';
          card += '<span style="background:' + vBg + ';color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">Vol ' + s.vol_class + '</span>';
        }
        card += '</div>';
      }
    }

    card += '</div></div>';
    modal.innerHTML = card;
    document.body.appendChild(modal);

  } catch (err) {
    console.error('showChampionTSRStores:', err);
  }
}

// ═══════════════════════════════════════════════════
// WEEKLY LEADERBOARD WIDGET — Top 3 + own rank
// ═══════════════════════════════════════════════════

async function loadLeaderboardWidget(session) {
  var container = document.getElementById('home-leaderboard-widget');
  if (!container) return;

  try {
    var lb = await getWeeklyLeaderboard(session.id);

    // Only show if there's at least 1 TSR with visits
    var hasActivity = false;
    for (var i = 0; i < lb.top3.length; i++) {
      if (lb.top3[i].visits > 0) { hasActivity = true; break; }
    }

    if (!hasActivity && (!lb.myEntry || lb.myEntry.visits === 0)) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';

    var rankEmojis = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49']; // gold, silver, bronze
    var rankColors = ['#FFD700', '#C0C0C0', '#CD7F32'];

    var html = '<div style="background:var(--bg-main);border-radius:var(--radius);overflow:hidden;border:1px solid #E4E6EB">';

    // Header
    html += '<div style="padding:12px 16px;border-bottom:1px solid #E4E6EB">';
    html += '<div style="font-size:15px;font-weight:700;color:var(--text-primary)">' + _champEsc(T.leaderboard) + '</div>';
    html += '</div>';

    // Top 3
    for (var r = 0; r < lb.top3.length; r++) {
      var entry = lb.top3[r];
      if (entry.visits === 0) continue;

      var isMe = entry.id === session.id;
      var bgColor = isMe ? 'rgba(0,166,206,0.06)' : 'transparent';

      html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid #f0f0f0;background:' + bgColor + ';min-height:48px">';

      // Rank emoji
      html += '<div style="font-size:20px;width:28px;text-align:center;flex-shrink:0">' + rankEmojis[r] + '</div>';

      // Name
      html += '<div style="flex:1;min-width:0">';
      html += '<div style="font-size:14px;font-weight:' + (isMe ? '700' : '600') + ';color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">';
      html += _champEsc(entry.name);
      if (isMe) html += ' <span style="font-size:11px;color:var(--accent);font-weight:700">(' + T.yourRank + ')</span>';
      html += '</div>';
      html += '</div>';

      // Visit count
      html += '<div style="font-size:14px;font-weight:700;color:#95C93D;flex-shrink:0">' + entry.visits + '</div>';

      html += '</div>';
    }

    // Separator + current user's rank (if not in top 3)
    if (lb.myRank > 3 && lb.myEntry) {
      html += '<div style="border-top:2px dashed #E4E6EB;display:flex;align-items:center;gap:10px;padding:10px 16px;background:rgba(0,166,206,0.06);min-height:48px">';

      // Rank number
      html += '<div style="font-size:14px;font-weight:700;color:var(--accent);width:28px;text-align:center;flex-shrink:0">' + T.rankLabel(lb.myRank) + '</div>';

      // Name + encouraging text
      html += '<div style="flex:1;min-width:0">';
      html += '<div style="font-size:14px;font-weight:700;color:var(--text-primary)">' + _champEsc(lb.myEntry.name) + ' <span style="font-size:11px;color:var(--accent)">(' + T.yourRank + ')</span></div>';
      html += '<div style="font-size:11px;color:var(--text-muted)">' + T.visitsThisWeek(lb.myEntry.visits) + ' &mdash; ' + T.keepGoing + '</div>';
      html += '</div>';

      // Visit count
      html += '<div style="font-size:14px;font-weight:700;color:#95C93D;flex-shrink:0">' + lb.myEntry.visits + '</div>';

      html += '</div>';
    }

    // If user IS in top 3, show encouraging message
    if (lb.myRank >= 1 && lb.myRank <= 3) {
      html += '<div style="padding:8px 16px;text-align:center;font-size:12px;color:var(--text-muted);border-top:1px solid #f0f0f0">';
      html += T.rankLabel(lb.myRank) + ' sa ' + lb.totalTSRs + ' TSRs &mdash; ' + T.keepGoing;
      html += '</div>';
    }

    html += '</div>';
    container.innerHTML = html;

  } catch (err) {
    console.error('loadLeaderboardWidget:', err);
    container.style.display = 'none';
  }
}
