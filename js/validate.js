/* ============================================================
   VieForce Patrol — Input Validation & Bilingual Error Messages
   Phase 8 hardening. Vanilla JS, no modules.
   ============================================================ */

var ERRORS = {
  required_name: { en: 'Store name is required', tl: 'Kailangan ang pangalan ng tindahan' },
  required_phone: { en: 'Phone number is required', tl: 'Kailangan ang numero ng telepono' },
  invalid_phone: { en: 'Phone must be 11 digits starting with 09', tl: 'Ang numero ay dapat 11 digit na nagsisimula sa 09' },
  required_pin: { en: 'PIN is required', tl: 'Kailangan ang PIN' },
  invalid_pin: { en: 'PIN must be 4-6 digits', tl: 'Ang PIN ay dapat 4-6 na digit' },
  required_visit_type: { en: 'Please select a visit type', tl: 'Pumili ng uri ng pagbisita' },
  required_store: { en: 'Please select a store', tl: 'Pumili ng tindahan' },
  invalid_amount: { en: 'Please enter a valid amount', tl: 'Maglagay ng tamang halaga' },
  gps_unavailable: { en: 'GPS is unavailable. Move to an open area.', tl: 'Hindi available ang GPS. Pumunta sa bukas na lugar.' },
  gps_low_accuracy: { en: 'GPS accuracy is low. Move to an open area.', tl: 'Mababa ang accuracy ng GPS. Pumunta sa bukas na lugar.' },
  network_error: { en: 'Network error. Your data was saved offline.', tl: 'Walang internet. Na-save ang data mo offline.' },
  sync_success: { en: 'Data synced successfully', tl: 'Matagumpay na na-sync ang data' },
  login_failed: { en: 'Invalid phone number or PIN', tl: 'Mali ang numero o PIN' },
  login_throttled: { en: 'Too many attempts. Try again in {n} seconds.', tl: 'Sobrang daming pagsubok. Subukan ulit sa {n} segundo.' },
  session_expired: { en: 'Session expired. Please log in again.', tl: 'Nag-expire ang session. Mag-login ulit.' },
  photo_too_large: { en: 'Photo is too large. Maximum 5MB.', tl: 'Masyadong malaki ang larawan. Maximum 5MB.' },
  save_success: { en: 'Saved successfully', tl: 'Matagumpay na na-save' },
  save_failed: { en: 'Failed to save. Please try again.', tl: 'Hindi na-save. Subukan ulit.' },
  confirm_deactivate: { en: 'Are you sure you want to deactivate this user?', tl: 'Sigurado ka bang gusto mong i-deactivate ang user na ito?' },
  offline_queued: { en: 'Saved offline. Will sync when connection is restored.', tl: 'Na-save offline. Ma-sync kapag may internet ulit.' }
};

/* ---------- Language helpers ---------- */

function getLanguage() {
  try {
    return localStorage.getItem('patrol_lang') === 'tl' ? 'tl' : 'en';
  } catch (e) {
    return 'en';
  }
}

function setLanguage(lang) {
  try {
    localStorage.setItem('patrol_lang', lang === 'tl' ? 'tl' : 'en');
  } catch (e) {
    // localStorage unavailable — silently fail
  }
}

function getError(key, replacements) {
  var lang = getLanguage();
  var entry = ERRORS[key];
  if (!entry) return key;
  var msg = entry[lang] || entry.en || key;
  if (replacements) {
    Object.keys(replacements).forEach(function (k) {
      msg = msg.replace(new RegExp('\\{' + k + '\\}', 'g'), replacements[k]);
    });
  }
  return msg;
}

/* ---------- Field validators ---------- */

function validatePhone(phone) {
  var cleaned = (phone || '').replace(/[\s\-().]/g, '');
  if (!cleaned) {
    return { valid: false, cleaned: cleaned, error: getError('required_phone') };
  }
  if (!/^09\d{9}$/.test(cleaned)) {
    return { valid: false, cleaned: cleaned, error: getError('invalid_phone') };
  }
  return { valid: true, cleaned: cleaned, error: null };
}

function validatePIN(pin) {
  var val = (pin || '').trim();
  if (!val) {
    return { valid: false, error: getError('required_pin') };
  }
  if (!/^\d{4,6}$/.test(val)) {
    return { valid: false, error: getError('invalid_pin') };
  }
  return { valid: true, error: null };
}

function validateStoreName(name) {
  var cleaned = (name || '').trim();
  if (!cleaned) {
    return { valid: false, cleaned: cleaned, error: getError('required_name') };
  }
  if (cleaned.length < 2) {
    return { valid: false, cleaned: cleaned, error: getError('required_name') };
  }
  if (cleaned.length > 100) {
    cleaned = cleaned.substring(0, 100);
  }
  return { valid: true, cleaned: cleaned, error: null };
}

function validateAmount(amount) {
  var num = parseFloat(amount);
  if (isNaN(num) || num <= 0) {
    return { valid: false, value: 0, error: getError('invalid_amount') };
  }
  return { valid: true, value: num, error: null };
}

function validateRequired(value, fieldKey) {
  var val = (typeof value === 'string') ? value.trim() : value;
  if (!val && val !== 0) {
    return { valid: false, error: getError(fieldKey || 'required_name') };
  }
  return { valid: true, error: null };
}

/* ---------- Sanitisation ---------- */

function sanitizeInput(str) {
  if (typeof str !== 'string') return '';
  var cleaned = str.replace(/<[^>]*>/g, '').trim();
  if (cleaned.length > 500) {
    cleaned = cleaned.substring(0, 500);
  }
  return cleaned;
}

/* ---------- DOM error display ---------- */

function showFieldError(inputEl, message) {
  if (!inputEl) return;
  clearFieldError(inputEl);
  inputEl.style.borderColor = '#e74c3c';
  var span = document.createElement('span');
  span.className = 'field-error';
  span.style.color = '#e74c3c';
  span.style.fontSize = '12px';
  span.style.display = 'block';
  span.style.marginTop = '4px';
  span.textContent = message;
  inputEl.parentNode.insertBefore(span, inputEl.nextSibling);
}

function clearFieldError(inputEl) {
  if (!inputEl) return;
  inputEl.style.borderColor = '';
  var next = inputEl.nextElementSibling;
  if (next && next.classList && next.classList.contains('field-error')) {
    next.remove();
  }
}

function clearAllErrors(containerEl) {
  if (!containerEl) return;
  var errors = containerEl.querySelectorAll('.field-error');
  for (var i = 0; i < errors.length; i++) {
    errors[i].remove();
  }
  var inputs = containerEl.querySelectorAll('[style*="border-color"]');
  for (var j = 0; j < inputs.length; j++) {
    inputs[j].style.borderColor = '';
  }
}
