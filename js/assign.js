// Assignment Module — DSM/Admin: assign stores to TSRs

var _assignTSRs = [];
var _assignStoresUnassigned = [];
var _assignStoresAssigned = [];
var _assignFarmsUnassigned = [];
var _assignFarmsAssigned = [];
var _assignMode = 'stores';
var _selectedTSR = null;

function _farmTypeLabel(type) {
  var labels = { hog: 'Hog', poultry: 'Manok', gamefowl: 'Gamefowl', aqua: 'Aqua', dairy: 'Dairy', mixed: 'Mixed', other: 'Other' };
  return labels[type] || type || 'Farm';
}

function setAssignMode(mode) {
  if (mode !== 'stores' && mode !== 'farms') return;
  if (_assignMode === mode) return;
  _assignMode = mode;
  _selectedTSR = null;
  var storesBtn = document.getElementById('assign-mode-stores');
  var farmsBtn = document.getElementById('assign-mode-farms');
  if (storesBtn) storesBtn.classList.toggle('active', mode === 'stores');
  if (farmsBtn) farmsBtn.classList.toggle('active', mode === 'farms');
  var title = document.getElementById('assign-page-title');
  if (title) title.textContent = mode === 'farms' ? 'I-assign ang Bukid' : 'I-assign ang Stores';
  var unassignedLabel = document.getElementById('assign-unassigned-label');
  if (unassignedLabel) {
    unassignedLabel.textContent = mode === 'farms' ? 'Mga Unassigned Bukid' : 'Mga Unassigned Stores';
  }
  var search = document.getElementById('assign-search-input');
  if (search) {
    search.placeholder = mode === 'farms' ? 'Hanapin ang bukid...' : 'Hanapin ang store...';
  }
  var label = document.getElementById('assign-selected-label');
  if (label) label.textContent = 'Pumili muna ng TSR';
  initAssignPage();
}

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
    _assignStoresAssigned = [];
    _assignFarmsAssigned = [];
    var assignedContainer = document.getElementById('assign-stores-assigned');
    if (assignedContainer) assignedContainer.innerHTML = '';

    if (_assignMode === 'farms') {
      var farmResults = await Promise.all([
        getTSRsByDistrict(district),
        getUnassignedFarms(district),
        getFarmAssignmentCounts()
      ]);
      _assignTSRs = farmResults[0];
      _assignFarmsUnassigned = farmResults[1];
      _assignStoresUnassigned = [];
      var farmCounts = farmResults[2];
      for (var fi = 0; fi < _assignTSRs.length; fi++) {
        _assignTSRs[fi]._assignedCount = farmCounts[_assignTSRs[fi].id] || 0;
      }
    } else {
      var results = await Promise.all([
        getTSRsByDistrict(district),
        getUnassignedStores(district),
        getAssignmentCounts()
      ]);
      _assignTSRs = results[0];
      _assignStoresUnassigned = results[1];
      _assignFarmsUnassigned = [];
      var counts = results[2];
      for (var i = 0; i < _assignTSRs.length; i++) {
        _assignTSRs[i]._assignedCount = counts[_assignTSRs[i].id] || 0;
      }
    }

    renderTSRList();
    renderUnassignedStores();
    updateAssignStats();
    updateBulkButton();
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

  var unassignedCount = _assignMode === 'farms'
    ? _assignFarmsUnassigned.length
    : _assignStoresUnassigned.length;
  var entityLabel = _assignMode === 'farms' ? 'farms' : 'stores';

  el.innerHTML =
    '<span style="font-weight:700;color:#004D71">' + _assignTSRs.length + '</span> TSRs' +
    ' &middot; <span style="font-weight:700;color:#95C93D">' + totalAssigned + '</span> assigned' +
    ' &middot; <span style="font-weight:700;color:#F7B928">' + unassignedCount + '</span> unassigned ' + entityLabel;
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

  // Load assigned stores/farms for this TSR
  if (_selectedTSR) {
    try {
      if (_assignMode === 'farms') {
        _assignFarmsAssigned = await getFarmsByTSR(tsrId);
        _assignStoresAssigned = [];
      } else {
        _assignStoresAssigned = await getStoresByTSR(tsrId);
        _assignFarmsAssigned = [];
      }
    } catch (err) {
      _assignStoresAssigned = [];
      _assignFarmsAssigned = [];
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

  var isFarm = _assignMode === 'farms';
  var list = isFarm ? _assignFarmsUnassigned : _assignStoresUnassigned;
  var countEl = document.getElementById('assign-unassigned-count');
  if (countEl) countEl.textContent = String(list.length);

  if (list.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#888;padding:24px;font-size:13px">' +
      (isFarm ? 'Lahat ng bukid ay na-assign na' : 'Lahat ng stores ay na-assign na') +
      '</div>';
    return;
  }

  var html = '';
  if (isFarm) {
    for (var f = 0; f < list.length; f++) {
      var farm = list[f];
      var floc = farm.city || farm.province || farm.region || '--';
      html += '<div class="assign-store-row" onclick="assignSingleStore(\'' + farm.id + '\')" data-store-id="' + farm.id + '">' +
        _healthDot(farm.health_status) +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _assignEsc(farm.name) + '</div>' +
          '<div style="font-size:11px;color:#65676B">' + _assignEsc(_farmTypeLabel(farm.type)) + ' · ' + _assignEsc(floc) + '</div>' +
        '</div>' +
      '</div>';
    }
  } else {
    for (var i = 0; i < list.length; i++) {
      var store = list[i];
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

  var isFarm = _assignMode === 'farms';
  var list = isFarm ? _assignFarmsAssigned : _assignStoresAssigned;
  var entityWord = isFarm ? 'bukid' : 'stores';

  if (list.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#888;padding:12px;font-size:12px">Walang assigned ' + entityWord + ' kay ' + _assignEsc(_selectedTSR.name) + '</div>';
    return;
  }

  var html = '<div style="font-size:11px;font-weight:700;color:#004D71;text-transform:uppercase;padding:8px 12px;border-bottom:1px solid #eee">' +
    'Assigned kay ' + _assignEsc(_selectedTSR.name) + ' (' + list.length + ')</div>';

  if (isFarm) {
    for (var f = 0; f < list.length; f++) {
      var farm = list[f];
      var floc = farm.city || farm.province || '--';
      html += '<div class="assign-store-row assigned" data-store-id="' + farm.id + '">' +
        _healthDot(farm.health_status) +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _assignEsc(farm.name) + '</div>' +
          '<div style="font-size:10px;color:#65676B">' + _assignEsc(_farmTypeLabel(farm.type)) + ' · ' + _assignEsc(floc) + '</div>' +
        '</div>' +
        '<button class="assign-remove-btn" onclick="event.stopPropagation();unassignSingleStore(\'' + farm.id + '\')" title="I-remove">&times;</button>' +
      '</div>';
    }
  } else {
    for (var i = 0; i < list.length; i++) {
      var store = list[i];
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
  }

  container.innerHTML = html;
}

// ── Assign Single Store ──

async function assignSingleStore(storeId) {
  if (!_selectedTSR) {
    assignToast('Pumili muna ng TSR sa kaliwa', 'error');
    return;
  }

  var isFarm = _assignMode === 'farms';

  try {
    if (isFarm) {
      await assignFarms([storeId], _selectedTSR.id);
    } else {
      await assignStores([storeId], _selectedTSR.id);
    }

    var item = null;
    var unassigned = isFarm ? _assignFarmsUnassigned : _assignStoresUnassigned;
    var assigned = isFarm ? _assignFarmsAssigned : _assignStoresAssigned;
    for (var i = 0; i < unassigned.length; i++) {
      if (unassigned[i].id === storeId) {
        item = unassigned.splice(i, 1)[0];
        break;
      }
    }
    if (item) {
      item.assigned_tsr = _selectedTSR.id;
      assigned.push(item);
    }

    _selectedTSR._assignedCount = (_selectedTSR._assignedCount || 0) + 1;

    renderTSRList();
    renderUnassignedStores();
    renderAssignedStores();
    updateAssignStats();
    updateBulkButton();

    var rows = document.querySelectorAll('.assign-tsr-row');
    for (var j = 0; j < rows.length; j++) {
      rows[j].classList.toggle('selected', rows[j].dataset.tsrId === _selectedTSR.id);
    }

    var label = isFarm ? 'Farm' : 'Store';
    assignToast(_assignEsc(item ? item.name : label) + ' assigned kay ' + _selectedTSR.name, 'success');
  } catch (err) {
    assignToast('Failed: ' + err.message, 'error');
  }
}

// ── Unassign Single Store ──

async function unassignSingleStore(storeId) {
  var isFarm = _assignMode === 'farms';

  try {
    if (isFarm) {
      await unassignFarms([storeId]);
    } else {
      await unassignStores([storeId]);
    }

    var item = null;
    var assigned = isFarm ? _assignFarmsAssigned : _assignStoresAssigned;
    var unassigned = isFarm ? _assignFarmsUnassigned : _assignStoresUnassigned;
    for (var i = 0; i < assigned.length; i++) {
      if (assigned[i].id === storeId) {
        item = assigned.splice(i, 1)[0];
        break;
      }
    }
    if (item) {
      item.assigned_tsr = null;
      unassigned.push(item);
      unassigned.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    }

    if (_selectedTSR) {
      _selectedTSR._assignedCount = Math.max(0, (_selectedTSR._assignedCount || 0) - 1);
    }

    renderTSRList();
    renderUnassignedStores();
    renderAssignedStores();
    updateAssignStats();
    updateBulkButton();

    if (_selectedTSR) {
      var rows = document.querySelectorAll('.assign-tsr-row');
      for (var j = 0; j < rows.length; j++) {
        rows[j].classList.toggle('selected', rows[j].dataset.tsrId === _selectedTSR.id);
      }
    }

    assignToast(isFarm ? 'Farm na-unassign' : 'Store na-unassign', 'success');
  } catch (err) {
    assignToast('Failed: ' + err.message, 'error');
  }
}

// ── Bulk Assign ──

function updateBulkButton() {
  var btn = document.getElementById('assign-bulk-btn');
  if (!btn) return;

  var isFarm = _assignMode === 'farms';
  var unassigned = isFarm ? _assignFarmsUnassigned : _assignStoresUnassigned;
  var entity = isFarm ? 'bukid' : 'stores';

  if (_selectedTSR && unassigned.length > 0) {
    btn.style.display = 'block';
    btn.textContent = 'I-assign lahat (' + unassigned.length + ' ' + entity + ') kay ' + _selectedTSR.name;
  } else {
    btn.style.display = 'none';
  }
}

async function bulkAssignAll() {
  var isFarm = _assignMode === 'farms';
  var unassigned = isFarm ? _assignFarmsUnassigned : _assignStoresUnassigned;
  if (!_selectedTSR || unassigned.length === 0) return;

  var count = unassigned.length;
  var entity = isFarm ? 'bukid' : 'stores';
  if (!confirm('I-assign ang ' + count + ' ' + entity + ' kay ' + _selectedTSR.name + '?')) return;

  try {
    var ids = unassigned.map(function (s) { return s.id; });
    if (isFarm) {
      await assignFarms(ids, _selectedTSR.id);
    } else {
      await assignStores(ids, _selectedTSR.id);
    }

    var assigned = isFarm ? _assignFarmsAssigned : _assignStoresAssigned;
    for (var i = 0; i < unassigned.length; i++) {
      unassigned[i].assigned_tsr = _selectedTSR.id;
      assigned.push(unassigned[i]);
    }
    _selectedTSR._assignedCount = (_selectedTSR._assignedCount || 0) + count;
    if (isFarm) {
      _assignFarmsUnassigned = [];
    } else {
      _assignStoresUnassigned = [];
    }

    renderTSRList();
    renderUnassignedStores();
    renderAssignedStores();
    updateAssignStats();
    updateBulkButton();

    var rows = document.querySelectorAll('.assign-tsr-row');
    for (var j = 0; j < rows.length; j++) {
      rows[j].classList.toggle('selected', rows[j].dataset.tsrId === _selectedTSR.id);
    }

    assignToast(count + ' ' + entity + ' na-assign kay ' + _selectedTSR.name, 'success');
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
