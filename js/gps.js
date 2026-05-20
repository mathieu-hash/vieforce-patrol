// GPS Wrapper: geolocation utilities, permission readiness, and last-good cache.

var PATROL_GPS_CACHE_KEY = 'patrol_last_gps';
var PATROL_GPS_READY_KEY = 'patrol_gps_ready';
var PATROL_GPS_DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;

function _patrolGpsNow() {
  return Date.now ? Date.now() : new Date().getTime();
}

function _cacheGpsPosition(pos) {
  if (!pos || pos.lat == null || pos.lng == null) return pos;
  var row = {
    lat: Number(pos.lat),
    lng: Number(pos.lng),
    accuracy: pos.accuracy == null ? null : Number(pos.accuracy),
    captured_at: new Date().toISOString(),
    ts: _patrolGpsNow()
  };
  try {
    localStorage.setItem(PATROL_GPS_CACHE_KEY, JSON.stringify(row));
    localStorage.setItem(PATROL_GPS_READY_KEY, '1');
  } catch (_) {}
  return pos;
}

function getCachedPosition(maxAgeMs) {
  try {
    var raw = localStorage.getItem(PATROL_GPS_CACHE_KEY);
    if (!raw) return null;
    var row = JSON.parse(raw);
    var maxAge = Number.isFinite(maxAgeMs) ? maxAgeMs : PATROL_GPS_DEFAULT_MAX_AGE_MS;
    var ts = Number(row.ts || new Date(row.captured_at || 0).getTime());
    if (!ts || (_patrolGpsNow() - ts) > maxAge) return null;
    if (row.lat == null || row.lng == null) return null;
    return {
      lat: Number(row.lat),
      lng: Number(row.lng),
      accuracy: row.accuracy == null ? null : Number(row.accuracy),
      cached: true,
      captured_at: row.captured_at || null
    };
  } catch (_) {
    return null;
  }
}

function getGpsReadyState() {
  var cached = getCachedPosition(24 * 60 * 60 * 1000);
  var markedReady = false;
  try { markedReady = localStorage.getItem(PATROL_GPS_READY_KEY) === '1'; } catch (_) {}
  return {
    ready: markedReady || !!cached,
    cached: cached,
    supported: !!(navigator && navigator.geolocation)
  };
}

async function getGpsPermissionState() {
  try {
    if (!navigator.permissions || !navigator.permissions.query) return 'unknown';
    var status = await navigator.permissions.query({ name: 'geolocation' });
    return status && status.state ? status.state : 'unknown';
  } catch (_) {
    return 'unknown';
  }
}

function getCurrentPosition(options) {
  var opts = options || {};
  return new Promise(function (resolve) {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        resolve(_cacheGpsPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        }));
      },
      function () {
        if (opts.allowCached) {
          resolve(getCachedPosition(opts.cacheMaxAge || PATROL_GPS_DEFAULT_MAX_AGE_MS));
          return;
        }
        resolve(null);
      },
      {
        timeout: opts.timeout || 10000,
        enableHighAccuracy: opts.enableHighAccuracy !== undefined ? opts.enableHighAccuracy : true,
        maximumAge: opts.maximumAge || 0
      }
    );
  });
}

function primeGps(options) {
  var opts = options || {};
  return getCurrentPosition({
    enableHighAccuracy: opts.enableHighAccuracy !== undefined ? opts.enableHighAccuracy : true,
    timeout: opts.timeout || 12000,
    maximumAge: opts.maximumAge || 30000,
    allowCached: opts.allowCached !== false,
    cacheMaxAge: opts.cacheMaxAge || PATROL_GPS_DEFAULT_MAX_AGE_MS
  });
}

function formatCoords(lat, lng) {
  return lat.toFixed(6) + ', ' + lng.toFixed(6);
}

function getGoogleMapsLink(lat, lng) {
  return 'https://www.google.com/maps?q=' + lat + ',' + lng;
}

if (typeof window !== 'undefined') {
  window.getCachedPosition = getCachedPosition;
  window.getGpsReadyState = getGpsReadyState;
  window.getGpsPermissionState = getGpsPermissionState;
  window.primeGps = primeGps;
}
