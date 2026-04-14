// Admin Module — user management panel (admin.html)

var _adminUsers = []; // cached user list

// ── Toast Notification ──

function showToast(message, type) {
  var existing = document.getElementById('admin-toast');
  if (existing) existing.remove();

  var toast = document.createElement('div');
  toast.id = 'admin-toast';
  toast.style.cssText = 'position:fixed;top:24px;right:24px;z-index:9999;padding:14px 24px;border-radius:8px;color:#fff;font-size:14px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,0.25);transition:opacity 0.4s;opacity:1;max-width:360px;';
  toast.style.background = type === 'error' ? '#e53e3e' : '#38a169';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(function () {
    toast.style.opacity = '0';
    setTimeout(function () { toast.remove(); }, 400);
  }, 3000);
}

// ── Stats ──

async function loadAdminStats() {
  try {
    var users = await getUsers();
    _adminUsers = users;

    var totalUsers = users.length;
    var activeTSRs = users.filter(function (u) {
      return u.role === 'tsr' && u.is_active === true;
    }).length;

    // Stores count
    var { data: stores, error: stErr } = await supabaseClient
      .from('stores')
      .select('id', { count: 'exact', head: true });
    var storeCount = 0;
    if (!stErr && stores !== null) {
      // head:true returns count in response
      storeCount = stores.length || 0;
    }
    // Fallback: use count from header
    var { count: storeExact } = await supabaseClient
      .from('stores')
      .select('*', { count: 'exact', head: true });
    if (typeof storeExact === 'number') storeCount = storeExact;

    // Visits this week
    var weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    var { count: visitCount } = await supabaseClient
      .from('visits')
      .select('*', { count: 'exact', head: true })
      .gte('visited_at', weekAgo.toISOString());

    var elUsers = document.getElementById('admin-stat-users');
    var elActive = document.getElementById('admin-stat-active');
    var elStores = document.getElementById('admin-stat-stores');
    var elVisits = document.getElementById('admin-stat-visits');

    if (elUsers) elUsers.textContent = totalUsers;
    if (elActive) elActive.textContent = activeTSRs;
    if (elStores) elStores.textContent = storeCount || 0;
    if (elVisits) elVisits.textContent = visitCount || 0;
  } catch (err) {
    console.error('loadAdminStats:', err);
    showToast('Failed to load stats: ' + err.message, 'error');
  }
}

// ── User Table ──

function getRoleBadge(role) {
  var colors = {
    tsr: 'background:#004D71;color:#fff;',
    dsm: 'background:#00A6CE;color:#fff;',
    rsm: 'background:#F1B11D;color:#000;',
    admin: 'background:#95C93D;color:#000;'
  };
  var style = colors[role] || 'background:#888;color:#fff;';
  return '<span style="' + style + 'padding:2px 10px;border-radius:12px;font-size:12px;font-weight:700;text-transform:uppercase;">' + (role || '').toUpperCase() + '</span>';
}

function getStatusBadge(isActive) {
  if (isActive) {
    return '<span style="background:#c6f6d5;color:#276749;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">Active</span>';
  }
  return '<span style="background:#fed7d7;color:#9b2c2c;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">Inactive</span>';
}

async function loadUserTable() {
  try {
    var users = await getUsers();
    _adminUsers = users;

    var container = document.getElementById('admin-user-table');
    if (!container) return;

    if (users.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:#888;padding:32px;">No users found.</p>';
      return;
    }

    var html = '<table style="width:100%;border-collapse:collapse;font-size:14px;">';
    html += '<thead><tr style="background:#f7fafc;text-align:left;">';
    html += '<th style="padding:10px 12px;border-bottom:2px solid #e2e8f0;">Name</th>';
    html += '<th style="padding:10px 12px;border-bottom:2px solid #e2e8f0;">Phone</th>';
    html += '<th style="padding:10px 12px;border-bottom:2px solid #e2e8f0;">Role</th>';
    html += '<th style="padding:10px 12px;border-bottom:2px solid #e2e8f0;">Region</th>';
    html += '<th style="padding:10px 12px;border-bottom:2px solid #e2e8f0;">Territory</th>';
    html += '<th style="padding:10px 12px;border-bottom:2px solid #e2e8f0;">Status</th>';
    html += '<th style="padding:10px 12px;border-bottom:2px solid #e2e8f0;">Actions</th>';
    html += '</tr></thead><tbody>';

    for (var i = 0; i < users.length; i++) {
      var u = users[i];
      html += '<tr data-user-id="' + u.id + '" style="border-bottom:1px solid #e2e8f0;">';
      html += '<td style="padding:10px 12px;font-weight:700;">' + escapeHtml(u.name) + '</td>';
      html += '<td style="padding:10px 12px;">' + escapeHtml(u.phone || '') + '</td>';
      html += '<td style="padding:10px 12px;">' + getRoleBadge(u.role) + '</td>';
      html += '<td style="padding:10px 12px;">' + escapeHtml(u.region || '-') + '</td>';
      html += '<td style="padding:10px 12px;">' + escapeHtml(u.territory || '-') + '</td>';
      html += '<td style="padding:10px 12px;">' + getStatusBadge(u.is_active) + '</td>';
      html += '<td style="padding:10px 12px;">';
      html += '<button onclick="openEditUserModal(\'' + u.id + '\')" style="background:#004D71;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;margin-right:4px;">Edit</button>';
      html += '<button onclick="toggleUserActive(\'' + u.id + '\',' + u.is_active + ')" style="background:' + (u.is_active ? '#e53e3e' : '#38a169') + ';color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;">' + (u.is_active ? 'Deactivate' : 'Activate') + '</button>';
      html += '</td></tr>';
    }

    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (err) {
    console.error('loadUserTable:', err);
    showToast('Failed to load users: ' + err.message, 'error');
  }
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ── Search ──

function searchUsers(query) {
  var q = (query || '').toLowerCase().trim();
  var rows = document.querySelectorAll('#admin-user-table tbody tr');
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var name = (row.children[0] ? row.children[0].textContent : '').toLowerCase();
    var phone = (row.children[1] ? row.children[1].textContent : '').toLowerCase();
    if (!q || name.indexOf(q) !== -1 || phone.indexOf(q) !== -1) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  }
}

// ── Add User Modal ──

function openAddUserModal() {
  var modal = document.getElementById('modal-add-user');
  if (!modal) return;

  // Reset form fields
  var form = modal.querySelector('form') || modal;
  var inputs = form.querySelectorAll('input, select, textarea');
  for (var i = 0; i < inputs.length; i++) {
    if (inputs[i].type === 'select-one') {
      inputs[i].selectedIndex = 0;
    } else {
      inputs[i].value = '';
    }
  }

  modal.style.display = 'flex';
}

function closeAddUserModal() {
  var modal = document.getElementById('modal-add-user');
  if (modal) modal.style.display = 'none';
}

async function submitAddUser() {
  var name = (document.getElementById('add-user-name') || {}).value || '';
  var phone = (document.getElementById('add-user-phone') || {}).value || '';
  var pin = (document.getElementById('add-user-pin') || {}).value || '';
  var role = (document.getElementById('add-user-role') || {}).value || 'tsr';
  var region = (document.getElementById('add-user-region') || {}).value || '';
  var district = (document.getElementById('add-user-district') || {}).value || '';
  var territory = (document.getElementById('add-user-territory') || {}).value || '';

  // Validate name
  if (!name.trim()) {
    showToast('Name is required.', 'error');
    return;
  }
  if (name.trim().length > 100) {
    showToast('Name must be under 100 characters.', 'error');
    return;
  }

  // Validate phone: 11 digits starting with 09
  var phoneClean = phone.replace(/\s/g, '');
  if (!/^09\d{9}$/.test(phoneClean)) {
    showToast('Phone must be 11 digits starting with 09 (e.g. 09171234567).', 'error');
    return;
  }

  // Validate PIN: 4-6 digits
  if (!/^\d{4,6}$/.test(pin)) {
    showToast('PIN must be 4-6 digits.', 'error');
    return;
  }

  // Validate optional fields
  if (region.length > 100 || district.length > 100 || territory.length > 100) {
    showToast('Region, district, and territory must each be under 100 characters.', 'error');
    return;
  }

  // Validate role enum
  var validRoles = ['tsr', 'dsm', 'rsm', 'admin'];
  if (validRoles.indexOf(role) === -1) {
    showToast('Invalid role selected.', 'error');
    return;
  }

  try {
    await createUser({
      name: name.trim(),
      phone: phoneClean,
      pin_hash: pin,
      role: role,
      region: region.trim() || null,
      district: district.trim() || null,
      territory: territory.trim() || null,
      is_active: true
    });

    closeAddUserModal();
    showToast('User "' + name.trim() + '" created successfully.', 'success');
    await loadUserTable();
    await loadAdminStats();
  } catch (err) {
    console.error('submitAddUser:', err);
    showToast('Failed to create user: ' + err.message, 'error');
  }
}

// ── Edit User Modal ──

function openEditUserModal(userId) {
  var user = null;
  for (var i = 0; i < _adminUsers.length; i++) {
    if (_adminUsers[i].id === userId) {
      user = _adminUsers[i];
      break;
    }
  }
  if (!user) {
    showToast('User not found.', 'error');
    return;
  }

  var modal = document.getElementById('modal-edit-user');
  if (!modal) return;

  // Populate fields
  var elId = document.getElementById('edit-user-id');
  var elName = document.getElementById('edit-user-name');
  var elPhone = document.getElementById('edit-user-phone');
  var elRole = document.getElementById('edit-user-role');
  var elRegion = document.getElementById('edit-user-region');
  var elDistrict = document.getElementById('edit-user-district');
  var elTerritory = document.getElementById('edit-user-territory');

  if (elId) elId.value = user.id;
  if (elName) elName.value = user.name || '';
  if (elPhone) elPhone.value = user.phone || '';
  if (elRole) elRole.value = user.role || 'tsr';
  if (elRegion) elRegion.value = user.region || '';
  if (elDistrict) elDistrict.value = user.district || '';
  if (elTerritory) elTerritory.value = user.territory || '';

  modal.style.display = 'flex';
}

function closeEditUserModal() {
  var modal = document.getElementById('modal-edit-user');
  if (modal) modal.style.display = 'none';
}

async function submitEditUser() {
  var userId = (document.getElementById('edit-user-id') || {}).value || '';
  var name = (document.getElementById('edit-user-name') || {}).value || '';
  var phone = (document.getElementById('edit-user-phone') || {}).value || '';
  var role = (document.getElementById('edit-user-role') || {}).value || 'tsr';
  var region = (document.getElementById('edit-user-region') || {}).value || '';
  var district = (document.getElementById('edit-user-district') || {}).value || '';
  var territory = (document.getElementById('edit-user-territory') || {}).value || '';

  if (!userId) {
    showToast('No user selected.', 'error');
    return;
  }

  if (!name.trim()) {
    showToast('Name is required.', 'error');
    return;
  }
  if (name.trim().length > 100) {
    showToast('Name must be under 100 characters.', 'error');
    return;
  }

  var phoneClean = phone.replace(/\s/g, '');
  if (!/^09\d{9}$/.test(phoneClean)) {
    showToast('Phone must be 11 digits starting with 09.', 'error');
    return;
  }

  if (region.length > 100 || district.length > 100 || territory.length > 100) {
    showToast('Region, district, and territory must each be under 100 characters.', 'error');
    return;
  }

  var validRoles = ['tsr', 'dsm', 'rsm', 'admin'];
  if (validRoles.indexOf(role) === -1) {
    showToast('Invalid role selected.', 'error');
    return;
  }

  try {
    await updateUser(userId, {
      name: name.trim(),
      phone: phoneClean,
      role: role,
      region: region.trim() || null,
      district: district.trim() || null,
      territory: territory.trim() || null,
      updated_at: new Date().toISOString()
    });

    closeEditUserModal();
    showToast('User updated successfully.', 'success');
    await loadUserTable();
    await loadAdminStats();
  } catch (err) {
    console.error('submitEditUser:', err);
    showToast('Failed to update user: ' + err.message, 'error');
  }
}

// ── Reset PIN ──

async function resetUserPIN(userId) {
  var newPin = prompt('Enter new PIN (4-6 digits):');
  if (newPin === null) return; // cancelled

  if (!/^\d{4,6}$/.test(newPin)) {
    showToast('PIN must be 4-6 digits.', 'error');
    return;
  }

  try {
    await updateUser(userId, {
      pin_hash: newPin,
      updated_at: new Date().toISOString()
    });
    showToast('PIN reset successfully.', 'success');
  } catch (err) {
    console.error('resetUserPIN:', err);
    showToast('Failed to reset PIN: ' + err.message, 'error');
  }
}

// ── Toggle Active ──

async function toggleUserActive(userId, currentStatus) {
  var newStatus = !currentStatus;
  var action = newStatus ? 'activate' : 'deactivate';

  if (!confirm('Are you sure you want to ' + action + ' this user?')) return;

  try {
    await updateUser(userId, {
      is_active: newStatus,
      updated_at: new Date().toISOString()
    });
    showToast('User ' + action + 'd successfully.', 'success');
    await loadUserTable();
    await loadAdminStats();
  } catch (err) {
    console.error('toggleUserActive:', err);
    showToast('Failed to ' + action + ' user: ' + err.message, 'error');
  }
}

// ── Export CSV ──

function exportUsersCSV() {
  if (!_adminUsers || _adminUsers.length === 0) {
    showToast('No user data to export.', 'error');
    return;
  }

  var headers = ['Name', 'Phone', 'Role', 'Region', 'District', 'Territory', 'Active', 'Created At'];
  var rows = [headers.join(',')];

  for (var i = 0; i < _adminUsers.length; i++) {
    var u = _adminUsers[i];
    var row = [
      csvEscape(u.name || ''),
      csvEscape(u.phone || ''),
      csvEscape((u.role || '').toUpperCase()),
      csvEscape(u.region || ''),
      csvEscape(u.district || ''),
      csvEscape(u.territory || ''),
      u.is_active ? 'Yes' : 'No',
      csvEscape(u.created_at || '')
    ];
    rows.push(row.join(','));
  }

  var csv = rows.join('\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);

  var today = new Date().toISOString().slice(0, 10);
  var link = document.createElement('a');
  link.href = url;
  link.download = 'vieforce-users-' + today + '.csv';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast('CSV exported successfully.', 'success');
}

function csvEscape(val) {
  var str = String(val);
  if (str.indexOf(',') !== -1 || str.indexOf('"') !== -1 || str.indexOf('\n') !== -1) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// ── Init ──

async function initAdmin() {
  var session = getSession();
  if (!session || session.role !== 'admin') {
    window.location.href = 'app.html';
    return;
  }

  await loadAdminStats();
  await loadUserTable();
}
