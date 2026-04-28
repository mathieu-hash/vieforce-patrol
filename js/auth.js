// Safety guard — labels.js must load before auth.js
if (typeof window.T === 'undefined') {
  window.T = {};
  console.error('CRITICAL: labels.js not loaded before auth.js');
}

// Auth Module — login, session, role checks (Phase 8 hardened)

var EDGE_FN_URL = 'https://yolxcmeoovztuindrglk.supabase.co/functions/v1/verify-pin';
var SESSION_KEY = 'patrol_session';
var ATTEMPTS_KEY = 'patrol_login_attempts';
var SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
var GOOGLE_ALLOWED_DOMAIN = 'vienovo.ph';
var GOOGLE_MANAGER_ROLES = ['dsm', 'rsm', 'exec', 'admin', 'ceo'];

/** Where Supabase redirects after Google (must match Dashboard redirect allow-list + Site URL). */
function getOAuthRedirectUrl() {
  var host = '';
  try {
    host = String(window.location.hostname || '').toLowerCase();
  } catch (e) {}
  var rawOriginBeforeLocal = '';
  try {
    rawOriginBeforeLocal = String(window.location.origin || '').replace(/\/$/, '');
  } catch (e0) {}
  var origin = '';
  if (window.CONFIG && CONFIG.OAUTH_PUBLIC_ORIGIN) {
    origin = String(CONFIG.OAUTH_PUBLIC_ORIGIN).replace(/\/$/, '');
  } else {
    origin = rawOriginBeforeLocal;
    if (host === 'localhost' || host === '127.0.0.1') {
      origin = 'https://vieforce-patrol.vercel.app';
    }
    if (!origin) origin = 'https://vieforce-patrol.vercel.app';
  }
  return origin + '/index.html';
}

/**
 * Surfaces OAuth / host misconfiguration early (console). Safe to call on index + app shells.
 * Does not block UI. Optional: ?oauthdebug=1 on index shows a one-line alert for field debugging.
 */
function warnPatrolOAuthEnvironment() {
  try {
    var proto = '';
    try {
      proto = String(window.location.protocol || '').toLowerCase();
    } catch (e0) {}
    if (proto === 'file:') {
      console.warn(
        'Patrol: opened as file:// — OAuth and sessions will not work. Serve from http(s) or open the deployed URL.'
      );
    }

    var host = '';
    try {
      host = String(window.location.hostname || '').toLowerCase();
    } catch (e1) {}
    var rawOrigin = '';
    try {
      rawOrigin = String(window.location.origin || '').replace(/\/$/, '');
    } catch (e2) {}

    var configured = '';
    if (window.CONFIG && CONFIG.OAUTH_PUBLIC_ORIGIN) {
      configured = String(CONFIG.OAUTH_PUBLIC_ORIGIN).replace(/\/$/, '');
    }

    // Production/staging hosts should match CONFIG unless explicitly using localhost dev.
    if (configured && host && host !== 'localhost' && host !== '127.0.0.1') {
      if (rawOrigin && rawOrigin !== configured) {
        console.warn(
          'Patrol: page origin',
          rawOrigin,
          'differs from CONFIG.OAUTH_PUBLIC_ORIGIN',
          configured,
          '— Google redirect_uri uses the configured origin; add this page origin to Supabase Redirect URLs if you intend to sign in here.'
        );
      }
    }

    if (window.CONFIG && (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY)) {
      console.warn('Patrol: CONFIG.SUPABASE_URL / SUPABASE_ANON_KEY missing — auth will fail.');
    }
  } catch (e) {
    /* non-fatal */
  }

  try {
    var qs = (window.location.search || '').indexOf('oauthdebug=1') !== -1;
    if (qs && typeof alert === 'function') {
      alert(
        'OAuth debug: origin=' +
          String(window.location.origin) +
          ' redirect=' +
          getOAuthRedirectUrl()
      );
    }
  } catch (e3) {}
}

window.warnPatrolOAuthEnvironment = warnPatrolOAuthEnvironment;

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

function normalizeEmail(raw) {
  if (!raw) return '';
  return String(raw).trim().toLowerCase();
}

function isManagerRole(role) {
  return GOOGLE_MANAGER_ROLES.indexOf(String(role || '').toLowerCase()) !== -1;
}

async function isGoogleProviderEnabled() {
  if (!window.CONFIG || !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) return null;
  try {
    var settingsUrl = CONFIG.SUPABASE_URL + '/auth/v1/settings?apikey=' + encodeURIComponent(CONFIG.SUPABASE_ANON_KEY);
    var res = await fetch(settingsUrl);
    if (!res.ok) return null;
    var data = await res.json();
    return !!(data && data.external && data.external.google);
  } catch (e) {
    return null;
  }
}

function createSessionFromUser(user, authSource) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    region: user.region || null,
    district: user.district || null,
    territory: user.territory || null,
    is_champion: user.is_champion || false,
    email: user.email || null,
    auth_source: authSource || 'pin',
    loggedInAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString()
  };
}

async function getManagerUserByEmail(email) {
  if (!window.supabaseClient) return null;
  var cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return null;

  var result = await supabaseClient
    .from('users')
    .select('id,name,role,region,district,territory,is_champion,is_active,email,auth_type')
    .eq('email', cleanEmail)
    .eq('is_active', true)
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message || 'Unable to validate manager account.');
  }
  return result.data || null;
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

  // Try edge function
  try {
    var res = await fetch(EDGE_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'apikey': CONFIG.SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ phone: cleanPhone, pin: cleanPin })
    });

    // Parse response body ONCE — never call res.json() twice
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }

    if (res.ok && data && data.id) {
      resetLoginAttempts();
      var session = createSessionFromUser(data, 'pin');
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      // Verify write landed before returning success
      var verify = localStorage.getItem(SESSION_KEY);
      if (!verify) {
        return { success: false, error: T.submitFail };
      }
      return { success: true, session: session };
    }

    // Error path — use already-parsed data
    recordFailedAttempt();

    if (res.status === 429) {
      return { success: false, error: (data && data.error) || T.errorThrottledGeneric, throttled: true };
    }
    return { success: false, error: (data && data.error) || T.errorWrongPin };
  } catch (e) {
    // Edge function unreachable (no internet)
    return { success: false, error: T.errorNetworkLogin };
  }
}

async function loginWithGoogle() {
  if (!window.supabaseClient || !supabaseClient.auth) {
    return {
      success: false,
      error: 'Google login is not configured for this app yet. Please ask support to enable Supabase Google Auth.'
    };
  }

  var providerEnabled = await isGoogleProviderEnabled();
  if (providerEnabled === false) {
    return {
      success: false,
      error: 'Google login is temporarily unavailable. Please use phone + PIN and ask support to enable Google Auth in Supabase.'
    };
  }

  var redirectTo = getOAuthRedirectUrl();
  var result = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectTo,
      queryParams: {
        hd: GOOGLE_ALLOWED_DOMAIN,
        prompt: 'select_account'
      }
    }
  });

  if (result.error) {
    return {
      success: false,
      error: 'Google login is unavailable right now. Please use TSR phone + PIN or contact support.'
    };
  }

  return { success: true, pendingRedirect: true };
}

async function maybeHandleGoogleLoginOnLoad() {
  if (!window.supabaseClient || !supabaseClient.auth) return { handled: false };

  var query = new URLSearchParams(window.location.search || '');
  var oauthError = query.get('error');
  var oauthErrorCode = query.get('error_code');
  var oauthErrorDescription = query.get('error_description');
  if (oauthError || oauthErrorCode || oauthErrorDescription) {
    if (window.history && typeof window.history.replaceState === 'function') {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    return {
      handled: true,
      success: false,
      error: decodeURIComponent(oauthErrorDescription || oauthError || oauthErrorCode || 'Google login failed. Please try again.')
    };
  }

  var pkceCode = query.get('code');
  var authSession = null;
  if (pkceCode) {
    var exchanged = await supabaseClient.auth.exchangeCodeForSession(pkceCode);
    if (window.history && typeof window.history.replaceState === 'function') {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    if (exchanged.error) {
      return {
        handled: true,
        success: false,
        error: exchanged.error.message || 'Google login could not complete (session exchange). Please try again.'
      };
    }
    authSession = exchanged.data && exchanged.data.session;
  }

  // Implicit / hash redirect (some providers or older configs) — PKCE normally uses ?code=
  if (!authSession || !authSession.user) {
    var rawHash = (window.location.hash || '').replace(/^#/, '');
    if (rawHash.indexOf('access_token=') !== -1) {
      var hp = new URLSearchParams(rawHash);
      var at = hp.get('access_token');
      var rt = hp.get('refresh_token');
      if (at && rt) {
        var setRes = await supabaseClient.auth.setSession({ access_token: at, refresh_token: rt });
        if (window.history && typeof window.history.replaceState === 'function') {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
        if (setRes.error) {
          return {
            handled: true,
            success: false,
            error: setRes.error.message || 'Google session could not be restored. Please try again.'
          };
        }
        authSession = setRes.data && setRes.data.session;
      }
    }
  }

  if (!authSession || !authSession.user) {
    var authSessionResult = await supabaseClient.auth.getSession();
    if (authSessionResult.error) {
      return { handled: false, error: 'Google session check failed. Please try again.' };
    }
    authSession = authSessionResult.data && authSessionResult.data.session;
  }
  if (!authSession || !authSession.user) return { handled: false };

  var email = normalizeEmail(authSession.user.email);
  if (!email || !email.endsWith('@' + GOOGLE_ALLOWED_DOMAIN)) {
    try { await supabaseClient.auth.signOut(); } catch (e) {}
    return {
      handled: true,
      success: false,
      error: 'Only @vienovo.ph Google accounts are allowed for manager login.'
    };
  }

  var manager;
  try {
    manager = await getManagerUserByEmail(email);
  } catch (e) {
    return {
      handled: true,
      success: false,
      error: e.message || 'Unable to validate Google manager account.'
    };
  }

  if (!manager) {
    try { await supabaseClient.auth.signOut(); } catch (e) {}
    return {
      handled: true,
      success: false,
      error: 'Google account not found in Patrol managers. Contact admin to map your email.'
    };
  }

  if (!isManagerRole(manager.role)) {
    try { await supabaseClient.auth.signOut(); } catch (e) {}
    return {
      handled: true,
      success: false,
      error: 'This Google login is for managers only. TSR must sign in with phone + PIN.'
    };
  }

  var session = createSessionFromUser(manager, 'google');
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return { handled: true, success: true, session: session };
}

// --- Post-login routing (Sprint A: all roles land on app.html; role-specific render happens inside) ---
function redirectAfterLogin(session) {
  // Stub for future multi-app routing (Sprint C: Google SSO may send managers to /hq)
  window.location.href = 'app.html';
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
  if (session) return session;

  // Retry once after 150ms — handles mobile localStorage flush delay
  setTimeout(function() {
    var retrySession = getSession();
    if (!retrySession) {
      window.location.href = 'index.html';
    }
  }, 150);

  // Return null for now — retry will handle redirect if truly no session
  return null;
}

function logout() {
  if (window.supabaseClient && supabaseClient.auth) {
    supabaseClient.auth.signOut().catch(function () {});
  }
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
