from pathlib import Path

p = Path(__file__).resolve().parents[1] / "js" / "assign.js"
text = p.read_text(encoding="utf-8")

def replace_block(text, start_marker, end_marker, new_body):
    start = text.index(start_marker)
    end = text.index(end_marker)
    return text[:start] + new_body + text[end:]

new_render_unassigned = """function renderUnassignedStores() {
  var container = document.getElementById('assign-stores-unassigned');
  if (!container) return;

  var isFarm = _assignMode === 'farms';
  var list = isFarm ? _assignFarmsUnassigned : _assignStoresUnassigned;
  var countEl = document.getElementById('assign-unassigned-count');
  if (countEl) countEl.textContent = String(list.length);

  if (list.length === 0) {
    container.innerHTML = '<motion style="text-align:center;color:#888;padding:24px;font-size:13px">' +
      (isFarm ? 'Lahat ng bukid ay na-assign na' : 'Lahat ng stores ay na-assign na') +
      '</div>';
    return;
  }

  var html = '';
  if (isFarm) {
    for (var f = 0; f < list.length; f++) {
      var farm = list[f];
      var floc = farm.city || farm.province || farm.region || '--';
      html += '<div class="assign-store-row" onclick="assignSingleStore(\\'' + farm.id + '\\')" data-store-id="' + farm.id + '">' +
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
      html += '<div class="assign-store-row" onclick="assignSingleStore(\\'' + store.id + '\\')" data-store-id="' + store.id + '">' +
        _healthDot(store.health_status) +
        '<motion style="flex:1;min-width:0">' +
          '<motion style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _assignEsc(store.name) + '</div>' +
          '<div style="font-size:11px;color:#65676B">' + _assignEsc(loc) + '</div>' +
        '</div>' +
        _volBadge(store.vol_class) +
      '</div>';
    }
  }

  container.innerHTML = html;
}

"""

# Fix any accidental motion tags from editor autocomplete
new_render_unassigned = new_render_unassigned.replace("<motion ", "<div ").replace("</motion>", "</div>")

new_render_assigned = """function renderAssignedStores() {
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
    'Assigned kay ' + _assignEsc(_selectedTSR.name) + ' (' + list.length + ')</motion>';

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
        '<button class="assign-remove-btn" onclick="event.stopPropagation();unassignSingleStore(\\'' + farm.id + '\\')" title="I-remove">&times;</button>' +
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
        '<button class="assign-remove-btn" onclick="event.stopPropagation();unassignSingleStore(\\'' + store.id + '\\')" title="I-remove">&times;</button>' +
      '</div>';
    }
  }

  container.innerHTML = html;
}

""".replace("</motion>", "</div>")

new_assign_single = """async function assignSingleStore(storeId) {
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

"""

new_unassign_single = """async function unassignSingleStore(storeId) {
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

"""

new_bulk_btn = """function updateBulkButton() {
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

"""

new_bulk_assign = """async function bulkAssignAll() {
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

"""

text = replace_block(
    text,
    "function renderUnassignedStores()",
    "// ── Render Assigned Stores (below TSR list when selected) ──",
    new_render_unassigned,
)
text = replace_block(
    text,
    "function renderAssignedStores()",
    "// ── Assign Single Store ──",
    new_render_assigned,
)
text = replace_block(text, "async function assignSingleStore(storeId)", "// ── Unassign Single Store ──", new_assign_single)
text = replace_block(text, "async function unassignSingleStore(storeId)", "// ── Bulk Assign ──", new_unassign_single)
text = replace_block(text, "function updateBulkButton()", "async function bulkAssignAll()", new_bulk_btn)
text = replace_block(text, "async function bulkAssignAll()", "// ── Search Unassigned Stores ──", new_bulk_assign)

p.write_text(text, encoding="utf-8")
print("assign.js patched OK")
