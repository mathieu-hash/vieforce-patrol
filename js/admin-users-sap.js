// User Admin — SAP roster (admin-users-sap.html)
// Loads /api/admin/sap-reps (HQ OSLP + Supabase linkage).

(function () {
  'use strict';

  var state = { reps: [], managers: [], filter: '' };

  function $(id) {
    return document.getElementById(id);
  }

  function apiHeaders() {
    var session = typeof getSession === 'function' ? getSession() : null;
    return {
      'Content-Type': 'application/json',
      'x-session-id': session && session.id ? session.id : ''
    };
  }

  function loadReps() {
    var loading = $('sap-loading');
    var errBox = $('sap-error');
    var errMsg = $('sap-error-msg');
    var table = $('sap-table-wrap');

    loading.classList.remove('hidden');
    errBox.classList.add('hidden');
    table.classList.add('hidden');

    fetch('/api/admin/sap-reps', { headers: apiHeaders(), cache: 'no-store' })
      .then(function (res) {
        return res.text().then(function (txt) {
          var data = null;
          try {
            data = txt ? JSON.parse(txt) : null;
          } catch (_) {}
          if (!res.ok) {
            var msg = (data && (data.message || data.error)) || 'HTTP ' + res.status;
            throw new Error(msg);
          }
          return data;
        });
      })
      .then(function (data) {
        state.reps = (data && data.reps) || [];
        state.managers = (data && data.supabase_managers) || [];
        $('sap-stat-total').textContent = String(state.reps.length);
        var linked = 0;
        for (var i = 0; i < state.reps.length; i++) {
          if (state.reps[i].linked_supabase_user) linked++;
        }
        $('sap-stat-linked').textContent = String(linked);
        $('sap-stat-open').textContent = String(state.reps.length - linked);
        renderRows();
        loading.classList.add('hidden');
        table.classList.remove('hidden');
      })
      .catch(function (err) {
        console.error('[admin-users-sap]', err);
        loading.classList.add('hidden');
        errMsg.textContent = err.message || String(err);
        errBox.classList.remove('hidden');
      });
  }

  function matchesFilter(rep) {
    var q = state.filter.trim().toLowerCase();
    if (!q) return true;
    var lu = rep.linked_supabase_user;
    var parts = [
      String(rep.slp_code),
      rep.slp_name,
      rep.memo,
      lu && lu.name,
      lu && lu.phone,
      lu && lu.role,
      lu && lu.region,
      lu && lu.district,
      lu && lu.territory
    ];
    var blob = parts.filter(Boolean).join(' ').toLowerCase();
    return blob.indexOf(q) !== -1;
  }

  function managerName(uRsm) {
    if (uRsm == null) return '—';
    var m = state.managers.find(function (x) {
      return Number(x.sap_slpcode) === Number(uRsm);
    });
    return m ? m.name + ' (' + uRsm + ')' : String(uRsm);
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function patrolPlaceholders(linked) {
    if (!linked) return { region: '—', district: '—', territory: '—' };
    function cell(v) {
      if (v == null || String(v).trim() === '') return '—';
      return escapeHtml(String(v).trim());
    }
    return {
      region: cell(linked.region),
      district: cell(linked.district),
      territory: cell(linked.territory)
    };
  }

  function renderRows() {
    var tbody = $('sap-tbody');
    var rows = state.reps.filter(matchesFilter);
    if (rows.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="12" style="text-align:center;padding:28px;color:#888;">No rows match your search.</td></tr>';
      return;
    }

    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var linked = r.linked_supabase_user;
      var plc = patrolPlaceholders(linked);
      var vacant = r.is_vacant ? '<span class="sap-badge sap-badge-warn">Vacant</span>' : '';
      var status = linked
        ? '<span class="sap-badge sap-badge-ok">Linked</span>'
        : '<span class="sap-badge sap-badge-muted">Not in Patrol</span>';
      var rowClass = r.is_vacant ? ' class="sap-row-vacant"' : '';
      html += '<tr' + rowClass + '>';
      html += '<td>' + escapeHtml(r.slp_code) + '</td>';
      html += '<td><strong>' + escapeHtml(r.slp_name || '') + '</strong></td>';
      html += '<td>' + vacant + '</td>';
      html += '<td>' + status + '</td>';
      html +=
        '<td>' +
        (linked ? escapeHtml(linked.name || '') + '<div class="sap-sub">' + escapeHtml(linked.id || '') + '</div>' : '—') +
        '</td>';
      html += '<td>' + (linked ? escapeHtml(linked.role || '') : '—') + '</td>';
      html += '<td>' + (linked && linked.phone ? escapeHtml(linked.phone) : escapeHtml(r.provisional_phone || '')) + '</td>';
      html += '<td>' + plc.region + '</td>';
      html += '<td>' + plc.district + '</td>';
      html += '<td>' + plc.territory + '</td>';
      html += '<td>' + escapeHtml(managerName(r.u_rsm)) + '</td>';
      html += '<td class="sap-memo">' + escapeHtml(r.memo || '') + '</td>';
      html += '</tr>';
    }
    tbody.innerHTML = html;
  }

  function exportCsv() {
    var rows = state.reps.filter(matchesFilter);
    var cols = [
      'slp_code',
      'slp_name',
      'is_vacant',
      'linked',
      'patrol_name',
      'patrol_role',
      'phone',
      'patrol_region',
      'patrol_district',
      'patrol_territory',
      'u_rsm',
      'memo'
    ];
    function escCell(v) {
      var s = v == null ? '' : String(v);
      if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }
    var lines = [cols.join(',')];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var linked = r.linked_supabase_user;
      lines.push(
        [
          r.slp_code,
          r.slp_name,
          r.is_vacant ? 'yes' : 'no',
          linked ? 'yes' : 'no',
          linked ? linked.name : '',
          linked ? linked.role : '',
          linked && linked.phone ? linked.phone : r.provisional_phone || '',
          linked && linked.region != null ? linked.region : '',
          linked && linked.district != null ? linked.district : '',
          linked && linked.territory != null ? linked.territory : '',
          r.u_rsm,
          r.memo || ''
        ]
          .map(escCell)
          .join(',')
      );
    }
    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'patrol-sap-roster.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  window.initAdminUsersSap = function () {
    $('sap-filter').addEventListener('input', function () {
      state.filter = this.value;
      renderRows();
    });
    $('sap-retry').addEventListener('click', loadReps);
    $('sap-export').addEventListener('click', exportCsv);
    loadReps();
  };
})();
