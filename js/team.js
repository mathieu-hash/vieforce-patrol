// Team Module — Manager view of direct reports (Sprint A)
// Renders on #page-team for DSM/RSM/Exec/Admin roles.

function _teamEsc(s) {
  if (s == null) return '';
  var d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

function _teamHash(str) {
  var h = 0;
  for (var i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
  return h;
}

function _teamGradient(id) {
  var palette = [
    'linear-gradient(135deg,#4A90E2,#6BA3E8)',
    'linear-gradient(135deg,#7EB87E,#95C695)',
    'linear-gradient(135deg,#C78AD9,#D5A0E2)',
    'linear-gradient(135deg,#F2B14A,#F7C97A)',
    'linear-gradient(135deg,#E8746E,#F0958F)'
  ];
  return palette[Math.abs(_teamHash(String(id || 'x'))) % palette.length];
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

  // Skeleton while loading
  container.innerHTML = '<div class="section-hdr" data-t="myTeam">\u26a1 ' + (T.myTeam || 'Team ko ngayon') + '</div>' +
    '<div class="store-row conv"><div class="skeleton skeleton-circle"></div>' +
    '<div class="conv-info"><div class="skeleton skeleton-line w60"></div>' +
    '<div class="skeleton skeleton-line w40"></div></div></div>';

  if (subtitle) subtitle.textContent = (session.role || '').toUpperCase() +
    (session.region ? ' \u00b7 ' + session.region : '');

  try {
    var members = await getDirectReports(session.id, session.role);
    if (!members || members.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:48px 24px">' +
        '<div style="font-size:48px;margin-bottom:16px">\ud83d\udc65</div>' +
        '<div style="font-size:15px;color:var(--text-secondary);line-height:1.5">' +
        (T.noTeamYet || 'Walang team member pa. Makipag-ugnayan sa admin.') +
        '</div></div>';
      return;
    }

    members.sort(function (a, b) { return (b.visits_today || 0) - (a.visits_today || 0); });

    var html = '<div class="section-hdr">\u26a1 ' + (T.myTeam || 'Team ko ngayon') + '</div>';

    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      var visits = m.visits_today || 0;
      var totalStores = m.assigned_stores || 0;
      var pct = totalStores > 0 ? Math.round((visits / totalStores) * 100) : 0;

      var dotColor = '#BCC0C4';
      var label = (T.noActivityToday || 'Walang activity ngayon');
      if (visits > 5) {
        dotColor = '#31A24C';
        label = visits + ' ' + (T.visitsToday || 'bisita ngayon') + ' \ud83d\udd25';
      } else if (visits > 0) {
        dotColor = '#F7B928';
        label = visits + ' ' + (T.bags || 'bisita') + ' \u00b7 ' + Math.max(0, totalStores - visits) + ' ' + (T.notVisited || 'hindi pa');
      }

      var initials = _initials(m.name);
      var grad = _teamGradient(m.id);
      var roleBadge = (m.role || '').toUpperCase();

      html += '<div class="store-row conv" data-member-id="' + _teamEsc(m.id) + '" onclick="openTeamMember(\'' + _teamEsc(m.id) + '\')">' +
        '<div class="av-wrap">' +
          '<div class="av" style="background:' + grad + '">' +
            '<span class="av-initials" style="font-size:15px;opacity:1">' + _teamEsc(initials) + '</span>' +
          '</div>' +
          '<div class="status-dot" style="background:' + dotColor + '"></div>' +
        '</div>' +
        '<div class="conv-info">' +
          '<div class="conv-name">' + _teamEsc(m.name) + ' <span style="font-size:10px;color:var(--text-muted);font-weight:600;margin-left:4px">' + _teamEsc(roleBadge) + '</span></div>' +
          '<div class="conv-last" style="color:' + dotColor + '">' + _teamEsc(label) + '</div>' +
        '</div>' +
        '<div class="conv-meta">' +
          '<span class="conv-time">' + pct + '%</span>' +
          (visits > 0 ? '<span class="ticks">\u2713\u2713</span>' : '') +
        '</div>' +
      '</div>';
    }
    container.innerHTML = html;
  } catch (err) {
    console.warn('renderTeamPage:', err);
    container.innerHTML = '<div style="padding:20px;color:var(--sync-error);text-align:center">' +
      (T.loadError || 'Hindi ma-load.') + '<br><small>' + _teamEsc(err.message || err) + '</small></div>';
  }

  updateTeamKPIs();
}

async function updateTeamKPIs() {
  var session = getSession();
  if (!session) return;
  try {
    var kpis = await getTeamKPIs(session.id, session.role);
    var v = document.getElementById('team-visits-today');
    var a = document.getElementById('team-active-tsrs');
    var s = document.getElementById('team-stores-covered');
    if (v) v.textContent = kpis.visits_today || 0;
    if (a) a.textContent = kpis.active_tsrs || 0;
    if (s) s.textContent = kpis.stores_covered || 0;
  } catch (e) { console.warn('updateTeamKPIs:', e); }
}

function openTeamMember(userId) {
  window._selectedTeamMember = userId;
  // TODO: page-team-detail not built yet — for now just log.
  console.log('[team] openTeamMember', userId);
}

window.renderTeamPage = renderTeamPage;
window.openTeamMember = openTeamMember;
window.updateTeamKPIs = updateTeamKPIs;
