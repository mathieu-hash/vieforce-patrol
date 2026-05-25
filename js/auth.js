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

/** Normalize app locale without relying on PatrolI18n (login page loads before i18n.js). */
function normalizeSessionLanguage(raw) {
  var s = String(raw || '')
    .trim()
    .toLowerCase();
  if (s === 'bis' || s === 'ceb' || s === 'cebuano' || s === 'bisaya') return 'ceb';
  if (s === 'fil' || s === 'tl' || s === 'tagalog') return 'tl';
  if (s === 'en' || s === 'english') return 'en';
  if (s === 'tl' || s === 'ceb') return s;
  return 'en';
}

/**
 * @param {object} user — row from verify-pin / Google manager lookup
 * @param {string} [authSource] — 'pin' | 'google'
 * @param {string} [pinLoginPhone] — normalized phone used for PIN login (fallback if API omits phone)
 */
function createSessionFromUser(user, authSource, pinLoginPhone) {
  var langRaw = user.language || user.locale || '';
  var lang = normalizeSessionLanguage(langRaw);
  if (!langRaw) {
    try {
      var pl = localStorage.getItem('patrol_locale');
      if (pl) lang = normalizeSessionLanguage(pl);
      else {
        var lg = (localStorage.getItem('patrol_lang') || '').toUpperCase();
        if (lg === 'TL') lang = 'tl';
        else if (lg === 'BIS') lang = 'ceb';
        else if (lg === 'EN') lang = 'en';
      }
    } catch (_e0) {}
  }
  var resolvedPhone = user.phone != null && String(user.phone).trim() !== ''
    ? String(user.phone).trim()
    : pinLoginPhone || null;
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    region: user.region || null,
    district: user.district || null,
    territory: user.territory || null,
    is_champion: user.is_champion || false,
    phone: resolvedPhone,
    email: user.email || null,
    language: lang,
    locale: lang,
    auth_source: authSource || 'pin',
    loggedInAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString()
  };
}

/** Merge fields into patrol_session + PatrolSession.user (Phase 4.8 language, etc.). */
function patchPatrolSession(partial) {
  try {
    var raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    var session = JSON.parse(raw);
    var k;
    for (k in partial) {
      if (Object.prototype.hasOwnProperty.call(partial, k)) session[k] = partial[k];
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    if (window.PatrolSession && window.PatrolSession.user) {
      for (k in partial) {
        if (Object.prototype.hasOwnProperty.call(partial, k)) window.PatrolSession.user[k] = partial[k];
      }
    }
    return true;
  } catch (e) {
    return false;
  }
}

window.patchPatrolSession = patchPatrolSession;

async function getManagerUserByEmail(email) {
  if (!window.supabaseClient) return null;
  var cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return null;

  var result = await supabaseClient
    .from('users')
    .select('id,name,role,region,district,territory,phone,is_champion,is_active,email,auth_type,language')
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
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        // Supabase API gateway requires Bearer; without it → 401 UNAUTHORIZED_NO_AUTH_HEADER (UI showed as wrong PIN).
        Authorization: 'Bearer ' + CONFIG.SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ phone: cleanPhone, pin: cleanPin })
    });

    // Parse response body ONCE — never call res.json() twice
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }

    if (res.ok && data && data.id) {
      resetLoginAttempts();
      var session = createSessionFromUser(data, 'pin', cleanPhone);
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
    return {
      success: false,
      error: (data && (data.error || data.message)) || T.errorWrongPin
    };
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
    // TODO(locale-parity-sweep): add `errorGoogleDomain` key to labels-v2.js
    // + locales/*.json. Proposed copy (CLAUDE.md §17 — TL first / BIS / EN):
    //   TL  → "Tanging @vienovo.ph Google account ang pwede sa manager login."
    //   BIS → "Mga @vienovo.ph Google account ra ang pwede sa manager login."
    //   EN  → "Only @vienovo.ph Google accounts are allowed for manager login."
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
    // TODO(locale-parity-sweep): add `errorManagerValidateFailed` key to
    // labels-v2.js + locales/*.json. Proposed copy:
    //   TL  → "Hindi ma-validate ang Google manager account. Subukan ulit."
    //   BIS → "Dili ma-validate ang Google manager account. Sulayi pag-usab."
    //   EN  → "Unable to validate Google manager account."
    return {
      handled: true,
      success: false,
      error: e.message || 'Unable to validate Google manager account.'
    };
  }

  if (!manager) {
    try { await supabaseClient.auth.signOut(); } catch (e) {}
    // TODO(locale-parity-sweep): add `errorManagerNotFound` key to labels-v2.js
    // + locales/*.json. Proposed copy:
    //   TL  → "Hindi nakita ang Google account sa Patrol managers. Tawagan ang admin para imap ang email mo."
    //   BIS → "Wala makita ang Google account sa Patrol managers. Sangpita ang admin aron imapa ang imong email."
    //   EN  → "Google account not found in Patrol managers. Contact admin to map your email."
    return {
      handled: true,
      success: false,
      error: 'Google account not found in Patrol managers. Contact admin to map your email.'
    };
  }

  if (!isManagerRole(manager.role)) {
    try { await supabaseClient.auth.signOut(); } catch (e) {}
    // TODO(locale-parity-sweep): add `errorManagerOnly` key to labels-v2.js
    // + locales/*.json. Proposed copy:
    //   TL  → "Para sa managers lang ang Google login. Ang TSR ay dapat mag-sign in gamit ang phone + PIN."
    //   BIS → "Para sa managers ra ang Google login. Ang TSR kinahanglan mag-sign in gamit ang phone + PIN."
    //   EN  → "This Google login is for managers only. TSR must sign in with phone + PIN."
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

/**
 * Returns the Supabase Auth Bearer token for API requests when a manager
 * is signed in via Google OAuth. TSR PIN sessions have no Bearer token
 * (api/_lib/auth.js falls back to x-session-id for them). Returns null
 * when no manager session exists; callers MUST handle null.
 *
 * Always returns a Promise — callers can safely `await` or `.then()`.
 * Tries the synchronous supabase-js cache first (`auth._currentSession`)
 * and falls back to async `auth.getSession()` for cases where the cache
 * has not been populated yet (e.g. just-exchanged PKCE code, or e2e
 * stubs that override getSession but not the internal cache field).
 */
async function getAuthBearer() {
  try {
    if (!window.supabaseClient || !supabaseClient.auth) return null;
    // supabase-js v2 caches the current session synchronously on the client
    // instance; use the internal accessor when present.
    var s = (typeof supabaseClient.auth._currentSession === 'object' && supabaseClient.auth._currentSession)
      ? supabaseClient.auth._currentSession
      : null;
    if (s && s.access_token) return s.access_token;
    // Fallback: ask Supabase Auth directly. This is what the test stub in
    // tests/e2e/21-oauth-flow.spec.ts overrides, and what supabase-js will
    // hit when the internal cache has not been populated yet.
    if (typeof supabaseClient.auth.getSession === 'function') {
      var r = await supabaseClient.auth.getSession();
      var sess = r && r.data && r.data.session;
      if (sess && sess.access_token) return sess.access_token;
    }
    return null;
  } catch (_e) {
    return null;
  }
}
window.getAuthBearer = getAuthBearer;

/**
 * W1-AuthCore: returns the canonical Patrol-API headers for the current session.
 *
 * Manager (Google OAuth) sessions → { Authorization: 'Bearer <jwt>' } only.
 * TSR (PIN) sessions               → { 'x-session-id': '<user.id>' } only.
 *
 * Async because the OAuth bearer must come from supabaseClient.auth.getSession()
 * (the live source of truth) — getAuthBearer()'s synchronous cache misses when
 * the supabase-js client just exchanged a PKCE code and has not yet populated
 * its internal _currentSession (or when an e2e stub overrides getSession but
 * not the cache, as in tests/e2e/21-oauth-flow.spec.ts).
 */
async function authHeaders() {
  var headers = { 'Content-Type': 'application/json' };
  try {
    if (window.supabaseClient && supabaseClient.auth && typeof supabaseClient.auth.getSession === 'function') {
      var r = await supabaseClient.auth.getSession();
      var sess = r && r.data && r.data.session;
      if (sess && sess.access_token) {
        headers['Authorization'] = 'Bearer ' + sess.access_token;
        return headers;
      }
    }
  } catch (_e) { /* fall through to PIN session */ }
  var pin = getSession();
  if (pin && pin.id) headers['x-session-id'] = pin.id;
  return headers;
}
window.authHeaders = authHeaders;

/**
 * Clear Patrol + Supabase sessions, then go to login.
 * Must await Supabase signOut before navigating: index.html's maybeHandleGoogleLoginOnLoad()
 * restores manager sessions from persisted auth if tokens are still present (race otherwise).
 */
async function logout() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (_e) {}
  resetLoginAttempts();
  try {
    if (window.supabaseClient && supabaseClient.auth) {
      await supabaseClient.auth.signOut();
    }
  } catch (_e) {}
  var origin = '';
  try {
    origin = String(window.location.origin || '').replace(/\/$/, '');
  } catch (_e2) {}
  window.location.href = origin ? origin + '/index.html' : 'index.html';
}

function hasRole(roles) {
  var session = getSession();
  if (!session) return false;
  return roles.indexOf(session.role) !== -1;
}

/**
 * Sales Admin + SAP user roster — EVP Sales, Sales Admin, Marketing Manager, CEO only.
 * Role slugs in public.users: evp, admin, marketing, ceo (case-insensitive).
 */
function canAccessUserAdmin(session) {
  var s = session || getSession();
  if (!s || !s.role) return false;
  var r = String(s.role).toLowerCase();
  return r === 'ceo' || r === 'admin' || r === 'evp' || r === 'marketing';
}

function isLoggedIn() {
  return getSession() !== null;
}
