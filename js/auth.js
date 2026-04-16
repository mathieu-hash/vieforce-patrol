// Auth Module — login, session, role checks (Phase 8 hardened)

var EDGE_FN_URL = 'https://yolxcmeoovztuindrglk.supabase.co/functions/v1/verify-pin';
var SESSION_KEY = 'patrol_session';
var ATTEMPTS_KEY = 'patrol_login_attempts';
var SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// --- Input Sanitization ---
function sanitizePhone(raw) {
  if (!raw) return null;
  var digits = String(raw).replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) return null;
  return digits;
}

function validatePin(raw) {
  if (!raw) return null;
  var pin = String(raw).trim();
  if (!/^\d{4,6}$/.test(pin)) return null;
  return pin;
}

// --- Client-side Throttle ---
function getLoginAttempts() {
  try {
    var raw = sessionStorage.getItem(ATTEMPTS_KEY);
    return raw ? JSON.parse(raw) : { count: 0, lastFailedAt: 0 };
  } catch (e) {
    return { count: 0, lastFailedAt: 0 };
  }
}

function recordFailedAttempt() {
  var attempts = getLoginAttempts();
  attempts.count++;
  attempts.lastFailedAt = Date.now();
  sessionStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
}

function resetLoginAttempts() {
  sessionStorage.removeItem(ATTEMPTS_KEY);
}

function getThrottleSecondsRemaining() {
  var attempts = getLoginAttempts();
  if (attempts.count < 3) return 0;
  // Exponential backoff: 30s after 3, 60s after 4, 120s after 5, etc.
  var waitMs = Math.min(30000 * Math.pow(2, attempts.count - 3), 15 * 60 * 1000);
  var elapsed = Date.now() - attempts.lastFailedAt;
  var remaining = Math.ceil((waitMs - elapsed) / 1000);
  return remaining > 0 ? remaining : 0;
}

// --- Login ---
async function login(phone, pin) {
  // Client-side throttle check
  var throttle = getThrottleSecondsRemaining();
  if (throttle > 0) {
    return { success: false, error: T.errorThrottled(throttle), throttled: true, secondsRemaining: throttle };
  }

  // Input sanitization
  var cleanPhone = sanitizePhone(phone);
  if (!cleanPhone) {
    return { success: false, error: T.errorInvalidPhone };
  }

  var cleanPin = validatePin(pin);
  if (!cleanPin) {
    return { success: false, error: T.errorInvalidPin };
  }

  // Try edge function first
  try {
    var res = await fetch(EDGE_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ phone: cleanPhone, pin: cleanPin })
    });

    if (res.ok) {
      var data = await res.json();
      if (data && data.id) {
        resetLoginAttempts();
        var session = {
          id: data.id,
          name: data.name,
          role: data.role,
          region: data.region || null,
          district: data.district || null,
          territory: data.territory || null,
          is_champion: data.is_champion || false,
          loggedInAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString()
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return { success: true, session: session };
      }
      var errData = await res.json().catch(function() { return data; });
      recordFailedAttempt();
      return { success: false, error: (errData && errData.error) || data.error || T.errorWrongPin };
    }

    // Non-OK response (401, 429, etc.)
    var errBody = null;
    try { errBody = await res.json(); } catch(e) { /* ignore */ }
    recordFailedAttempt();

    if (res.status === 429) {
      return { success: false, error: (errBody && errBody.error) || T.errorThrottledGeneric, throttled: true };
    }
    return { success: false, error: (errBody && errBody.error) || T.errorWrongPin };
  } catch (e) {
    // Edge function unreachable (no internet)
    return { success: false, error: T.errorNetworkLogin };
  }
}

// --- Session Management ---
function getSession() {
  try {
    var raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    var session = JSON.parse(raw);
    // Check expiry
    if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch (e) {
    return null;
  }
}

function requireAuth() {
  var session = getSession();
  if (!session) {
    window.location.href = 'index.html';
  }
  return session;
}

function logout() {
  localStorage.removeItem(SESSION_KEY);
  resetLoginAttempts();
  window.location.href = 'index.html';
}

function hasRole(roles) {
  var session = getSession();
  if (!session) return false;
  return roles.indexOf(session.role) !== -1;
}

function isLoggedIn() {
  return getSession() !== null;
}
