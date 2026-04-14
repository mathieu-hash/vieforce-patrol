// Auth Module — login, session, role checks

var EDGE_FN_URL = 'https://yolxcmeoovztuindrglk.supabase.co/functions/v1/verify-pin';
var SESSION_KEY = 'patrol_session';

async function login(phone, pin) {
  // Try edge function first
  try {
    var res = await fetch(EDGE_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ phone: phone, pin: pin })
    });
    if (res.ok) {
      var data = await res.json();
      if (data && data.id) {
        var session = {
          id: data.id,
          name: data.name,
          role: data.role,
          region: data.region || null,
          district: data.district || null,
          territory: data.territory || null,
          loggedInAt: new Date().toISOString()
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return { success: true, session: session };
      }
      return { success: false, error: data.error || 'Invalid credentials' };
    }
  } catch (e) {
    // Edge function not deployed — fall through to direct query
  }

  // V1 fallback: direct Supabase query (plain text PIN)
  var { data, error } = await supabaseClient
    .from('users')
    .select('*')
    .eq('phone', phone)
    .eq('pin_hash', pin)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    return { success: false, error: 'Invalid phone or PIN' };
  }

  var session = {
    id: data.id,
    name: data.name,
    role: data.role,
    region: data.region || null,
    district: data.district || null,
    territory: data.territory || null,
    loggedInAt: new Date().toISOString()
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return { success: true, session: session };
}

function getSession() {
  try {
    var raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function requireAuth() {
  if (!getSession()) {
    window.location.href = 'index.html';
  }
}

function logout() {
  localStorage.removeItem(SESSION_KEY);
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
