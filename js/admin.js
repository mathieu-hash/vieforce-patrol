// Admin Module — user management panel (admin.html)

var _adminUsers = []; // cached user list

// Must stay aligned with Supabase users_role_check / HQ onboarding roles.
var ADMIN_PANEL_ALLOWED_ROLES = [
  'tsr',
  'champion',
  'dsm',
  'rsm',
  'exec',
  'admin',
  'ceo',
  'evp',
  'director',
  'president',
  'marketing'
];

// ── Toast Notification ──

function showToast(message, type) {
  var existing = document.getElementById('admin-toast');
  if (existing) existing.remove();

  var toast = document.createElement('div');
  toast.id = 'admin-toast';
  toast.setAttribute('role', 'status');
  toast.className = 'admin-toast ' + (type === 'error' ? 'admin-toast--error' : 'admin-toast--success');
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(function () {
    toast.style.opacity = '0';
    setTimeout(function () {
      toast.remove();
    }, 400);
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
    showToast('Failed to load stats: ' + friendlyAdminErr(err), 'error');
  }
}

// ── User Table ──

function roleBadgeClass(role) {
  var r = String(role || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
  if (!r) return 'unknown';
  if (
    [
      'tsr',
      'champion',
      'dsm',
      'rsm',
      'exec',
      'director',
      'admin',
      'ceo',
      'evp',
      'president',
      'marketing'
    ].indexOf(r) === -1
  ) {
    return 'unknown';
  }
  return r;
}

function getRoleBadge(role) {
  var cls = roleBadgeClass(role);
  var label = role ? String(role).toUpperCase() : '—';
  return '<span class="role-badge ' + cls + '">' + escapeHtml(label) + '</span>';
}

function getStatusBadge(isActive) {
  if (isActive) {
    return '<span class="status-badge active">Active</span>';
  }
  return '<span class="status-badge inactive">Inactive</span>';
}

function _pinRaw(u) {
  return u && u.pin_hash != null ? String(u.pin_hash) : '';
}

function _isBcryptPin(raw) {
  var s = String(raw || '');
  return s.indexOf('$2') === 0 && s.length > 15;
}

function _isPlainPinDigits(raw) {
  return /^\d{4,6}$/.test(String(raw || '').trim());
}

/**
 * Admin table cell: show digits when DB stores plaintext PIN; otherwise hashed / empty.
 */
function getPinDisplayUser(u) {
  var raw = _pinRaw(u);
  if (!raw) {
    return '<span class="admin-pin-none" title="No PIN on file">\u2014</span>';
  }
  if (_isPlainPinDigits(raw)) {
    return (
      '<span class="admin-pin-plain" title="Plaintext in DB (admin only) — avoid in production if possible">' +
      escapeHtml(raw) +
      '</span>'
    );
  }
  if (_isBcryptPin(raw)) {
    return (
      '<span class="admin-pin-hashed" title="Legacy bcrypt — user cannot log in until you set a new plain PIN (Edit → Reset PIN).">' +
      '<strong>Hashed (legacy)</strong> <span class="admin-pin-suffix">reset required</span></span>'
    );
  }
  return (
    '<span class="admin-pin-hashed" title="Unrecognized format — set a new PIN under Edit.">' +
    '<strong>Unknown</strong> <span class="admin-pin-suffix">reset suggested</span></span>'
  );
}

function _formatCurrentPinField(u) {
  var raw = _pinRaw(u);
  if (!raw) {
    return { value: '', hint: 'No PIN on file. Set one below or use Add User flow.' };
  }
  if (_isPlainPinDigits(raw)) {
    return {
      value: raw,
      hint: 'Stored as plain digits in the database (visible to admins on this page only).'
    };
  }
  if (_isBcryptPin(raw)) {
    return {
      value: '(legacy bcrypt — cannot display)',
      hint: 'Login uses plain PINs now. Reset PIN below once; the new digits will show in this table.'
    };
  }
  return {
    value: '(unrecognized — set new PIN below)',
    hint: 'Save a new 4–6 digit PIN so the account can log in.'
  };
}

function adminOrgSummary(u) {
  var parts = [];
  if (u.region) parts.push('Region: ' + u.region);
  if (u.district) parts.push('District: ' + u.district);
  if (u.territory) parts.push('Territory: ' + u.territory);
  if (!parts.length) return 'Region / District / Territory not set';
  return parts.join(' · ');
}

/** Align with js/auth.js GOOGLE_MANAGER_ROLES — managers need email for Google OAuth. */
var ADMIN_GOOGLE_LOGIN_ROLES = ['dsm', 'rsm', 'exec', 'admin', 'ceo'];

function normalizeAdminEmail(raw) {
  var e = String(raw || '').trim().toLowerCase();
  return e || null;
}

function validateAdminEmailForRole(emailRaw, role) {
  var r = String(role || '').toLowerCase();
  var normalized = normalizeAdminEmail(emailRaw);
  if (!normalized) {
    if (ADMIN_GOOGLE_LOGIN_ROLES.indexOf(r) !== -1) {
      return {
        ok: false,
        msg: 'Email is required for roles that sign in with Google (DSM, RSM, Exec, Sales Admin, CEO). Use their @vienovo.ph address.'
      };
    }
    return { ok: true, value: null };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { ok: false, msg: 'Enter a valid email address.' };
  }
  if (normalized.length > 254) {
    return { ok: false, msg: 'Email must be under 254 characters.' };
  }
  if (ADMIN_GOOGLE_LOGIN_ROLES.indexOf(r) !== -1 && normalized.slice(-12) !== '@vienovo.ph') {
    return {
      ok: false,
      msg: 'Manager Google login requires an @vienovo.ph email that matches their Google account.'
    };
  }
  return { ok: true, value: normalized };
}

function adminEmailLine(u) {
  var email = u && u.email ? String(u.email).trim() : '';
  if (email) {
    return '<span title="Google sign-in email">' + escapeHtml(email) + '</span>';
  }
  var r = String((u && u.role) || '').toLowerCase();
  if (ADMIN_GOOGLE_LOGIN_ROLES.indexOf(r) !== -1) {
    return (
      '<span class="admin-email-missing" title="Add @vienovo.ph email in Edit — required for Google sign-in">' +
      'No email — Google login blocked</span>'
    );
  }
  return '<span class="admin-email-none">No email</span>';
}

async function loadUserTable() {
  try {
    var users =
      typeof getUsersForAdmin === 'function'
        ? await getUsersForAdmin()
        : await getUsers();
    _adminUsers = users;

    var host = document.getElementById('admin-user-list');
    if (!host) return;

    if (users.length === 0) {
      host.innerHTML = '<p class="admin-empty">No users found.</p>';
      return;
    }

    var html = '';
    for (var i = 0; i < users.length; i++) {
      var u = users[i];
      var uid = String(u.id || '').replace(/'/g, "\\'");
      html += '<article class="admin-user-card" role="listitem" data-user-id="' + escapeHtml(u.id) + '">';
      html += '<div class="admin-user-card-main">';
      html += '<h3 class="admin-user-card-name">' + escapeHtml(u.name || '—') + '</h3>';
      html += '<div class="admin-user-card-line">';
      html += '<span>' + escapeHtml(u.phone || '—') + '</span>';
      html += adminEmailLine(u);
      html += '<span>PIN ' + getPinDisplayUser(u) + '</span>';
      html += getRoleBadge(u.role);
      html += getStatusBadge(u.is_active);
      html += '</div>';
      html += '<p class="admin-user-card-org">' + escapeHtml(adminOrgSummary(u)) + '</p>';
      html += '</div>';
      html += '<div class="admin-user-card-actions">';
      html +=
        '<button type="button" class="tbl-btn" onclick="openEditUserModal(\'' +
        uid +
        '\')">Edit</button>';
      if (u.is_active) {
        html +=
          '<button type="button" class="tbl-btn danger" onclick="toggleUserActive(\'' +
          uid +
          '\',true)">Deactivate</button>';
      } else {
        html +=
          '<button type="button" class="tbl-btn tbl-btn-activate" onclick="toggleUserActive(\'' +
          uid +
          '\',false)">Activate</button>';
      }
      html += '</div></article>';
    }

    host.innerHTML = html;
  } catch (err) {
    console.error('loadUserTable:', err);
    showToast('Failed to load users: ' + friendlyAdminErr(err), 'error');
  }
}

function friendlyAdminErr(err) {
  var msg = (err && err.message) ? String(err.message) : String(err || 'Something went wrong');
  if (/network|fetch|failed/i.test(msg)) {
    return 'Connection issue. Check your network and try again.';
  }
  return msg;
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ── Organization hints (Region / District / Territory) ──

function adminOrgHintForRole(role) {
  var r = String(role || 'tsr').toLowerCase();
  if (r === 'tsr' || r === 'champion') {
    return 'TSR / Champion: set Region and District to match the DSM team. District text must be identical to that DSM’s District. Territory is optional (e.g. route).';
  }
  if (r === 'dsm') {
    return 'DSM: Region + District describe the district you manage. Every TSR in your team must use the same District spelling. Replacing the DSM person = edit user here; do not rename District on all TSRs unless the structure changed.';
  }
  if (r === 'rsm' || r === 'ceo') {
    return 'RSM / CEO: Region drives regional maps and rollups. Leave District blank unless you intentionally scope sub-areas.';
  }
  return 'Optional: Region / District / Territory if this login should be scoped in Patrol. Many Sales Admin or HQ roles leave these blank.';
}

function syncAdminOrgHint(mode) {
  var selId = mode === 'add' ? 'add-role' : 'edit-role';
  var hintId = mode === 'add' ? 'add-org-hint' : 'edit-org-hint';
  var sel = document.getElementById(selId);
  var hint = document.getElementById(hintId);
  if (!hint) return;
  hint.textContent = sel ? adminOrgHintForRole(sel.value) : '';
}

function wireAdminOrgHintListeners() {
  var ar = document.getElementById('add-role');
  var er = document.getElementById('edit-role');
  if (ar && !ar._patrolOrgHintBound) {
    ar._patrolOrgHintBound = true;
    ar.addEventListener('change', function () {
      syncAdminOrgHint('add');
    });
  }
  if (er && !er._patrolOrgHintBound) {
    er._patrolOrgHintBound = true;
    er.addEventListener('change', function () {
      syncAdminOrgHint('edit');
    });
  }
}

// ── Search ──

function searchUsers(query) {
  var q = (query || '').toLowerCase().trim();
  var cards = document.querySelectorAll('#admin-user-list .admin-user-card');
  for (var i = 0; i < cards.length; i++) {
    var card = cards[i];
    var hay = (card.textContent || '').toLowerCase();
    card.style.display = !q || hay.indexOf(q) !== -1 ? '' : 'none';
  }
}

// ── Modals (admin.html uses #modal-* + .modal-overlay.visible) ──

var _adminModalPrevFocus = null;
var _adminModalA11yBound = false;

function getAdminModalFocusables(modal) {
  if (!modal) return [];
  var sel =
    'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  var nodes = modal.querySelectorAll(sel);
  var out = [];
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    if (el.getAttribute('hidden') != null || el.getAttribute('aria-hidden') === 'true') continue;
    var st = window.getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden') continue;
    out.push(el);
  }
  return out;
}

function openAdminModal(modal) {
  if (!modal) return;
  _adminModalPrevFocus = document.activeElement;
  modal.classList.add('visible');
  requestAnimationFrame(function () {
    var list = getAdminModalFocusables(modal);
    if (list.length) list[0].focus();
  });
}

function adminModalDocumentKeydown(ev) {
  var modal = document.querySelector('.modal-overlay.visible');
  if (!modal) return;

  if (ev.key === 'Escape') {
    ev.preventDefault();
    closeModal(modal.id);
    return;
  }

  if (ev.key !== 'Tab') return;

  var focusables = getAdminModalFocusables(modal);
  if (focusables.length === 0) return;

  var first = focusables[0];
  var last = focusables[focusables.length - 1];
  var active = document.activeElement;
  var inside = modal.contains(active);

  if (ev.shiftKey) {
    if (!inside || active === first) {
      ev.preventDefault();
      last.focus();
    }
  } else {
    if (!inside || active === last) {
      ev.preventDefault();
      first.focus();
    }
  }
}

function initAdminModalA11y() {
  if (_adminModalA11yBound) return;
  _adminModalA11yBound = true;
  document.addEventListener('keydown', adminModalDocumentKeydown, true);
}

function closeModal(modalId) {
  var modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('visible');
  if (_adminModalPrevFocus && typeof _adminModalPrevFocus.focus === 'function') {
    try {
      _adminModalPrevFocus.focus();
    } catch (e) {
      /* ignore */
    }
  }
  _adminModalPrevFocus = null;
}

function closeModalOnOverlay(ev, modalId) {
  if (ev.target === ev.currentTarget) closeModal(modalId);
}

// ── Add User Modal ──

function openAddUserModal() {
  var modal = document.getElementById('modal-add-user');
  if (!modal) return;

  var form = modal.querySelector('form') || modal;
  var inputs = form.querySelectorAll('input, select, textarea');
  for (var i = 0; i < inputs.length; i++) {
    if (inputs[i].tagName === 'SELECT') {
      inputs[i].selectedIndex = 0;
    } else {
      inputs[i].value = '';
    }
  }

  openAdminModal(modal);
  syncAdminOrgHint('add');
  if (window.PatrolAdminOrgPicklists) {
    PatrolAdminOrgPicklists.applyValues('add-region', 'add-district', 'add-territory', '', '', '');
  }
}

function closeAddUserModal() {
  closeModal('modal-add-user');
}

async function submitAddUser() {
  var name = (document.getElementById('add-name') || {}).value || '';
  var phone = (document.getElementById('add-phone') || {}).value || '';
  var emailRaw = (document.getElementById('add-email') || {}).value || '';
  var pin = (document.getElementById('add-pin') || {}).value || '';
  var role = (document.getElementById('add-role') || {}).value || 'tsr';
  var region = (document.getElementById('add-region') || {}).value || '';
  var district = (document.getElementById('add-district') || {}).value || '';
  var territory = (document.getElementById('add-territory') || {}).value || '';

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

  if (ADMIN_PANEL_ALLOWED_ROLES.indexOf(role) === -1) {
    showToast('Invalid role selected.', 'error');
    return;
  }

  var emailCheck = validateAdminEmailForRole(emailRaw, role);
  if (!emailCheck.ok) {
    showToast(emailCheck.msg, 'error');
    return;
  }

  try {
    await createUser({
      name: name.trim(),
      phone: phoneClean,
      email: emailCheck.value,
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
    showToast('Failed to create user: ' + friendlyAdminErr(err), 'error');
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

  var elId = document.getElementById('edit-user-id');
  var elName = document.getElementById('edit-name');
  var elPhone = document.getElementById('edit-phone');
  var elEmail = document.getElementById('edit-email');
  var elRole = document.getElementById('edit-role');
  var elRegion = document.getElementById('edit-region');
  var elDistrict = document.getElementById('edit-district');
  var elTerritory = document.getElementById('edit-territory');
  var elStatus = document.getElementById('edit-status');

  if (elId) elId.value = user.id;
  if (elName) elName.value = user.name || '';
  if (elPhone) elPhone.value = user.phone || '';
  if (elEmail) elEmail.value = user.email || '';
  if (elRole) elRole.value = user.role || 'tsr';
  if (elRegion) elRegion.value = user.region || '';
  if (elDistrict) elDistrict.value = user.district || '';
  if (elTerritory) elTerritory.value = user.territory || '';
  if (elStatus) elStatus.value = user.is_active === false ? 'false' : 'true';

  var cur = _formatCurrentPinField(user);
  var elPinCur = document.getElementById('edit-pin-current');
  var elPinHint = document.getElementById('edit-pin-current-hint');
  if (elPinCur) elPinCur.value = cur.value;
  if (elPinHint) elPinHint.textContent = cur.hint;

  var elPinNew = document.getElementById('edit-pin-new');
  var elPinConfirm = document.getElementById('edit-pin-confirm');
  if (elPinNew) elPinNew.value = '';
  if (elPinConfirm) elPinConfirm.value = '';

  openAdminModal(modal);
  syncAdminOrgHint('edit');
  if (window.PatrolAdminOrgPicklists) {
    PatrolAdminOrgPicklists.applyValues(
      'edit-region',
      'edit-district',
      'edit-territory',
      user.region || '',
      user.district || '',
      user.territory || ''
    );
  }
}

function closeEditUserModal() {
  closeModal('modal-edit-user');
}

async function submitEditUser() {
  var userId = (document.getElementById('edit-user-id') || {}).value || '';
  var name = (document.getElementById('edit-name') || {}).value || '';
  var phone = (document.getElementById('edit-phone') || {}).value || '';
  var emailRaw = (document.getElementById('edit-email') || {}).value || '';
  var role = (document.getElementById('edit-role') || {}).value || 'tsr';
  var region = (document.getElementById('edit-region') || {}).value || '';
  var district = (document.getElementById('edit-district') || {}).value || '';
  var territory = (document.getElementById('edit-territory') || {}).value || '';
  var statusRaw = (document.getElementById('edit-status') || {}).value || 'true';

  var newPin = ((document.getElementById('edit-pin-new') || {}).value || '').trim();
  var confirmPin = ((document.getElementById('edit-pin-confirm') || {}).value || '').trim();

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

  if (ADMIN_PANEL_ALLOWED_ROLES.indexOf(role) === -1) {
    showToast('Invalid role selected.', 'error');
    return;
  }

  var emailCheck = validateAdminEmailForRole(emailRaw, role);
  if (!emailCheck.ok) {
    showToast(emailCheck.msg, 'error');
    return;
  }

  if (newPin || confirmPin) {
    if (newPin !== confirmPin) {
      showToast('New PIN and confirmation do not match.', 'error');
      return;
    }
    if (!/^\d{4,6}$/.test(newPin)) {
      showToast('PIN must be 4-6 digits.', 'error');
      return;
    }
  }

  try {
    var payload = {
      name: name.trim(),
      phone: phoneClean,
      email: emailCheck.value,
      role: role,
      region: region.trim() || null,
      district: district.trim() || null,
      territory: territory.trim() || null,
      is_active: statusRaw === 'true',
      updated_at: new Date().toISOString()
    };
    if (newPin) {
      payload.pin_hash = newPin;
    }

    await updateUser(userId, payload);

    var elPn = document.getElementById('edit-pin-new');
    var elPc = document.getElementById('edit-pin-confirm');
    if (elPn) elPn.value = '';
    if (elPc) elPc.value = '';

    closeEditUserModal();
    showToast('User updated successfully.', 'success');
    await loadUserTable();
    await loadAdminStats();
  } catch (err) {
    console.error('submitEditUser:', err);
    showToast('Failed to update user: ' + friendlyAdminErr(err), 'error');
  }
}

// ── Reset PIN ──

async function resetUserPIN(userId) {
  var uid =
    userId ||
    (document.getElementById('edit-user-id') || {}).value ||
    '';
  if (!uid) {
    showToast('Open a user for editing first.', 'error');
    return;
  }

  var newPin = prompt('Enter new PIN (4-6 digits):');
  if (newPin === null) return; // cancelled

  if (!/^\d{4,6}$/.test(newPin)) {
    showToast('PIN must be 4-6 digits.', 'error');
    return;
  }

  try {
    await updateUser(uid, {
      pin_hash: newPin,
      updated_at: new Date().toISOString()
    });
    showToast('PIN reset successfully.', 'success');
    await loadUserTable();
  } catch (err) {
    console.error('resetUserPIN:', err);
    showToast('Failed to reset PIN: ' + friendlyAdminErr(err), 'error');
  }
}

/** admin.html onclick aliases */
function saveNewUser() {
  submitAddUser();
}

function saveEditUser() {
  submitEditUser();
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
    showToast('Failed to ' + action + ' user: ' + friendlyAdminErr(err), 'error');
  }
}

// ── Export CSV ──

function exportUsersCSV() {
  if (!_adminUsers || _adminUsers.length === 0) {
    showToast('No user data to export.', 'error');
    return;
  }

  var headers = [
    'Name',
    'Phone',
    'Email',
    'PIN (plain if stored)',
    'PIN is hashed',
    'Role',
    'Region',
    'District',
    'Territory',
    'Active',
    'Created At'
  ];
  var rows = [headers.join(',')];

  for (var i = 0; i < _adminUsers.length; i++) {
    var u = _adminUsers[i];
    var raw = _pinRaw(u);
    var plain = _isPlainPinDigits(raw) ? raw : '';
    var hashed = u.has_pin && !_isPlainPinDigits(raw) ? 'yes' : 'no';
    var row = [
      csvEscape(u.name || ''),
      csvEscape(u.phone || ''),
      csvEscape(u.email || ''),
      csvEscape(plain),
      hashed,
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
  if (!session || typeof canAccessUserAdmin !== 'function' || !canAccessUserAdmin(session)) {
    window.location.href = 'app.html';
    return;
  }

  initAdminModalA11y();
  wireAdminOrgHintListeners();

  if (window.PatrolAdminOrgPicklists) {
    PatrolAdminOrgPicklists.wireSelects('add-region', 'add-district', 'add-territory');
    PatrolAdminOrgPicklists.wireSelects('edit-region', 'edit-district', 'edit-territory');
  }

  await loadAdminStats();
  await loadUserTable();
}
