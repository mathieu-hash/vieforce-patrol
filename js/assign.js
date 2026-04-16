// Assignment Module — DSM/Admin: assign stores to TSRs

var _assignTSRs = [];
var _assignStoresUnassigned = [];
var _assignStoresAssigned = [];
var _selectedTSR = null;

// ── Escape HTML ──

function _assignEsc(str) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str || ''));
  return div.innerHTML;
}

// ── Toast (reuse admin toast pattern) ──

function assignToast(message, type) {
  var existing = document.getElementById('assign-toast');
  if (existing) existing.remove();

  var toast = document.createElement('div');
  toast.id = 'assign-toast';
  toast.style.cssText = 'position:fixed;top:24px;right:24px;z-index:9999;padding:14px 24px;border-radius:8px;color:#fff;font-size:14px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,0.25);transition:opacity 0.4s;opacity:1;max-width:360px;';
  toast.style.background = type === 'error' ? '#E21B90' : '#95C93D';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(function () {
    toast.style.opacity = '0';
    setTimeout(function () { toast.remove(); }, 400);
  }, 3000);
}

// ── Vol Class Badge ──

function _volBadge(volClass) {
  if (!volClass) return '';
  var colors = {
    A: 'background:#004D71;color:#fff;',
    B: 'background:#00A6CE;color:#fff;',
    C: 'background:#888;color:#fff;'
  };
  return '<span style="' + (colors[volClass] || colors.C) +
    'padding:1px 8px;border-radius:10px;font-size:10px;font-weight:700;margin-left:6px">' +
    'Vol ' + volClass + '</span>';
}

// ── Health Dot ──

function _healthDot(status) {
  var color = status === 'crit' ? '#FA383E' : status === 'warn' ? '#F7B928' : '#31A24C';
  return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + color + ';margin-right:6px"></span>';
}

// ── Load Assignment Page ──

async function initAssignPage() {
  var session = getSession();
  if (!session || (session.role !== 'dsm' && session.role !== 'rsm' && session.role !== 'admin')) {
    return;
  }

  _selectedTSR = null;
  var district = session.district || null;

  try {
    // Load TSRs and unassigned stores in parallel
    var results = await Promise.all([
      getTSRsByDistrict(district),
      getUnassignedStores(district),
      getAssignmentCounts()
    ]);

    _assignTSRs = results[0];
    _assignStoresUnassigned = results[1];
    var counts = results[2];

    // Attach counts to TSRs
    for (var i = 0; i < _assignTSRs.length; i++) {
      _assignTSRs[i]._assignedCount = counts[_assignTSRs[i].id] || 0;
    }

    renderTSRList();
    renderUnassignedStores();
    updateAssignStats();
  } catch (err) {
    console.error('initAssignPage:', err);
    assignToast('Failed to load: ' + err.message, 'error');
  }
}

// ── Stats bar ──

function updateAssignStats() {
  var el = document.getElementById('assign-stats');
  if (!el) return;

  var totalAssigned = 0;
  for (var i = 0; i < _assignTSRs.length; i++) {
    totalAssigned += _assignTSRs[i]._assignedCount || 0;
  }

  el.innerHTML =
    '<span style="font-weight:700;color:#004D71">' + _assignTSRs.length + '</span> TSRs' +
    ' &middot; <span style="font-weight:700;color:#95C93D">' + totalAssigned + '</span> assigned' +
    ' &middot; <span style="font-weight:700;color:#F7B928">' + _assignStoresUnassigned.length + '</span> unassigned';
}

// ── Render TSR List (left column) ──

function renderTSRList() {
  var container = document.getElementById('assign-tsr-list');
  if (!container) return;

  if (_assignTSRs.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#888;padding:24px;font-size:13px">Walang TSR sa district na ito</div>';
    return;
  }

  var html = '';
  for (var i = 0; i < _assignTSRs.length; i++) {
    var tsr = _assignTSRs[i];
    var initials = tsr.name ? tsr.name.split(' ').map(function(w) { return w[0]; }).join('').toUpperCase().slice(0, 2) : '??';
    var isSelected = _selectedTSR && _selectedTSR.id === tsr.id;
    var territory = tsr.territory || tsr.district || '--';
    var count = tsr._assignedCount || 0;

    html += '<div class="assign-tsr-row' + (isSelected ? ' selected' : '') + '" ' +
      'onclick="selectTSR(\'' + tsr.id + '\')" data-tsr-id="' + tsr.id + '">' +
      '<div class="assign-avatar">' + _assignEsc(initials) + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:14px;font-weight:700;color:#050505;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _assignEsc(tsr.name) + '</div>' +
        '<div style="font-size:11px;color:#65676B">' + _assignEsc(territory) + '</div>' +
      '</div>' +
      '<div class="assign-count-badge">' + count + '</div>' +
    '</div>';
  }

  container.innerHTML = html;
}

// ── Select TSR ──

async function selectTSR(tsrId) {
  _selectedTSR = null;
  for (var i = 0; i < _assignTSRs.length; i++) {
    if (_assignTSRs[i].id === tsrId) {
      _selectedTSR = _assignTSRs[i];
      break;
    }
  }

  // Update visual selection
  var rows = document.querySelectorAll('.assign-tsr-row');
  for (var j = 0; j < rows.length; j++) {
    rows[j].classList.toggle('selected', rows[j].dataset.tsrId === tsrId);
  }

  // Update selected TSR label
  var label = document.getElementById('assign-selected-label');
  if (label) {
    label.textContent = _selectedTSR ? 'I-assign kay: ' + _selectedTSR.name : 'Pumili muna ng TSR';
  }

  // Load assigned stores for this TSR
  if (_selectedTSR) {
    try {
      _assignStoresAssigned = await getStoresByTSR(tsrId);
    } catch (err) {
      _assignStoresAssigned = [];
    }
    renderAssignedStores();
  }

  // Update bulk button
  updateBulkButton();
}

// ── Render Unassigned Stores (right column) ──

function renderUnassignedStores() {
  var container = document.getElementById('assign-stores-unassigned');
  if (!container) return;

  if (_assignStoresUnassigned.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#888;padding:24px;font-size:13px">Lahat ng stores ay na-assign na</div>';
    return;
  }

  var html = '';
  for (var i = 0; i < _assignStoresUnassigned.length; i++) {
    var store = _assignStoresUnassigned[i];
    var loc = store.city || store.province || store.region || '--';

    html += '<div class="assign-store-row" onclick="assignSingleStore(\'' + store.id + '\')" data-store-id="' + store.id + '">' +
      _healthDot(store.health_status) +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _assignEsc(store.name) + '</div>' +
        '<div style="font-size:11px;color:#65676B">' + _assignEsc(loc) + '</div>' +
      '</div>' +
      _volBadge(store.vol_class) +
    '</div>';
  }

  container.innerHTML = html;
}

// ── Render Assigned Stores (below TSR list when selected) ──

function renderAssignedStores() {
  var container = document.getElementById('assign-stores-assigned');
  if (!container) return;

  if (!_selectedTSR) {
    container.innerHTML = '';
    return;
  }

  if (_assignStoresAssigned.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#888;padding:12px;font-size:12px">Walang assigned stores kay ' + _assignEsc(_selectedTSR.name) + '</div>';
    return;
  }

  var html = '<div style="font-size:11px;font-weight:700;color:#004D71;text-transform:uppercase;padding:8px 12px;border-bottom:1px solid #eee">' +
    'Assigned kay ' + _assignEsc(_selectedTSR.name) + ' (' + _assignStoresAssigned.length + ')</div>';

  for (var i = 0; i < _assignStoresAssigned.length; i++) {
    var store = _assignStoresAssigned[i];
    var loc = store.city || store.province || '--';

    html += '<div class="assign-store-row assigned" data-store-id="' + store.id + '">' +
      _healthDot(store.health_status) +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _assignEsc(store.name) + '</div>' +
        '<div style="font-size:10px;color:#65676B">' + _assignEsc(loc) + '</div>' +
      '</div>' +
      '<button class="assign-remove-btn" onclick="event.stopPropagation();unassignSingleStore(\'' + store.id + '\')" title="I-remove">&times;</button>' +
    '</div>';
  }

  container.innerHTML = html;
}

// ── Assign Single Store ──

async function assignSingleStore(storeId) {
  if (!_selectedTSR) {
    assignToast('Pumili muna ng TSR sa kaliwa', 'error');
    return;
  }

  try {
    await assignStores([storeId], _selectedTSR.id);

    // Move store from unassigned to assigned
    var store = null;
    for (var i = 0; i < _assignStoresUnassigned.length; i++) {
      if (_assignStoresUnassigned[i].id === storeId) {
        store = _assignStoresUnassigned.splice(i, 1)[0];
        break;
      }
    }
    if (store) {
      store.assigned_tsr = _selectedTSR.id;
      _assignStoresAssigned.push(store);
    }

    // Update TSR count
    _selectedTSR._assignedCount = (_selectedTSR._assignedCount || 0) + 1;

    renderTSRList();
    renderUnassignedStores();
    renderAssignedStores();
    updateAssignStats();

    // Re-select the TSR row visually
    var rows = document.querySelectorAll('.assign-tsr-row');
    for (var j = 0; j < rows.length; j++) {
      rows[j].classList.toggle('selected', rows[j].dataset.tsrId === _selectedTSR.id);
    }

    assignToast(_assignEsc(store ? store.name : 'Store') + ' assigned kay ' + _selectedTSR.name, 'success');
  } catch (err) {
    assignToast('Failed: ' + err.message, 'error');
  }
}

// ── Unassign Single Store ──

async function unassignSingleStore(storeId) {
  try {
    await unassignStores([storeId]);

    // Move store from assigned to unassigned
    var store = null;
    for (var i = 0; i < _assignStoresAssigned.length; i++) {
      if (_assignStoresAssigned[i].id === storeId) {
        store = _assignStoresAssigned.splice(i, 1)[0];
        break;
      }
    }
    if (store) {
      store.assigned_tsr = null;
      _assignStoresUnassigned.push(store);
      _assignStoresUnassigned.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    }

    // Update TSR count
    if (_selectedTSR) {
      _selectedTSR._assignedCount = Math.max(0, (_selectedTSR._assignedCount || 0) - 1);
    }

    renderTSRList();
    renderUnassignedStores();
    renderAssignedStores();
    updateAssignStats();

    // Re-select
    if (_selectedTSR) {
      var rows = document.querySelectorAll('.assign-tsr-row');
      for (var j = 0; j < rows.length; j++) {
        rows[j].classList.toggle('selected', rows[j].dataset.tsrId === _selectedTSR.id);
      }
    }

    assignToast('Store na-unassign', 'success');
  } catch (err) {
    assignToast('Failed: ' + err.message, 'error');
  }
}

// ── Bulk Assign ──

function updateBulkButton() {
  var btn = document.getElementById('assign-bulk-btn');
  if (!btn) return;

  if (_selectedTSR && _assignStoresUnassigned.length > 0) {
    btn.style.display = 'block';
    btn.textContent = 'I-assign lahat (' + _assignStoresUnassigned.length + ') kay ' + _selectedTSR.name;
  } else {
    btn.style.display = 'none';
  }
}

async function bulkAssignAll() {
  if (!_selectedTSR || _assignStoresUnassigned.length === 0) return;

  var count = _assignStoresUnassigned.length;
  if (!confirm('I-assign ang ' + count + ' stores kay ' + _selectedTSR.name + '?')) return;

  try {
    var ids = _assignStoresUnassigned.map(function (s) { return s.id; });
    await assignStores(ids, _selectedTSR.id);

    // Move all to assigned
    for (var i = 0; i < _assignStoresUnassigned.length; i++) {
      _assignStoresUnassigned[i].assigned_tsr = _selectedTSR.id;
      _assignStoresAssigned.push(_assignStoresUnassigned[i]);
    }
    _selectedTSR._assignedCount = (_selectedTSR._assignedCount || 0) + count;
    _assignStoresUnassigned = [];

    renderTSRList();
    renderUnassignedStores();
    renderAssignedStores();
    updateAssignStats();
    updateBulkButton();

    // Re-select
    var rows = document.querySelectorAll('.assign-tsr-row');
    for (var j = 0; j < rows.length; j++) {
      rows[j].classList.toggle('selected', rows[j].dataset.tsrId === _selectedTSR.id);
    }

    assignToast(count + ' stores na-assign kay ' + _selectedTSR.name, 'success');
  } catch (err) {
    assignToast('Bulk assign failed: ' + err.message, 'error');
  }
}

// ── Search Unassigned Stores ──

function searchAssignStores(query) {
  var q = (query || '').toLowerCase().trim();
  var rows = document.querySelectorAll('#assign-stores-unassigned .assign-store-row');
  for (var i = 0; i < rows.length; i++) {
    var text = rows[i].textContent.toLowerCase();
    rows[i].style.display = (!q || text.indexOf(q) !== -1) ? '' : 'none';
  }
}
