// VieForce Patrol — Service Worker v3
// Domain: patrol.vienovo.ph
// Cache First: app shell, labels, Leaflet tiles
// Network First: Supabase API → fallback to cached response
// Network Only: photos (too large to cache)

var CACHE_NAME = 'patrol-v5';
var APP_SHELL = [
  '/',
  '/app.html',
  '/index.html',
  '/admin.html',
  '/config.js',
  '/css/patrol.css',
  '/js/supabase.js',
  '/js/auth.js',
  '/js/db.js',
  '/js/gps.js',
  '/js/offline.js',
  '/js/camera.js',
  '/js/stores.js',
  '/js/visits.js',
  '/js/visit-wizard.js',
  '/js/map.js',
  '/js/dashboard.js',
  '/js/labels.js',
  '/js/validate.js',
  '/js/admin.js',
  '/js/assign.js',
  '/js/champion.js',
  '/js/export.js',
  '/js/ux-polish.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install — cache the app shell
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(APP_SHELL);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activate — clean old caches
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; })
             .map(function(n) { return caches.delete(n); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch — strategy per request type
self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);

  // Skip non-GET requests
  if (e.request.method !== 'GET') return;

  // --- Photos: Network Only (never cache — too large) ---
  if (url.pathname.match(/\.(jpg|jpeg|png|webp|gif)$/i) &&
      url.hostname.includes('supabase.co')) {
    return;
  }

  // --- Supabase API calls: Network First → fallback to cached ---
  if (url.hostname.includes('supabase.co')) {
    e.respondWith(
      fetch(e.request).then(function(res) {
        if (res.ok) {
          var clone = res.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, clone);
          });
        }
        return res;
      }).catch(function() {
        return caches.match(e.request).then(function(cached) {
          if (cached) return cached;
          // No cached API data — return offline JSON
          return new Response(
            JSON.stringify({ error: 'offline', message: 'Offline ka ngayon. Mag-sync kapag may signal na.' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        });
      })
    );
    return;
  }

  // --- Leaflet tiles: Cache First (maps work offline) ---
  if (url.hostname.includes('basemaps.cartocdn.com') ||
      url.hostname.includes('tile.openstreetmap.org')) {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        if (cached) return cached;
        return fetch(e.request).then(function(res) {
          if (res.ok) {
            var clone = res.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(e.request, clone);
            });
          }
          return res;
        }).catch(function() {
          // Return transparent 1x1 PNG for missing tiles
          return new Response(
            Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRUEFTuQmCC'), function(c) { return c.charCodeAt(0); }),
            { headers: { 'Content-Type': 'image/png' } }
          );
        });
      })
    );
    return;
  }

  // --- CDN resources (fonts, leaflet JS/CSS, chart.js, supabase-js, dexie): Cache First ---
  if (url.hostname.includes('cdn.jsdelivr.net') ||
      url.hostname.includes('unpkg.com') ||
      url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        if (cached) return cached;
        return fetch(e.request).then(function(res) {
          if (res.ok) {
            var clone = res.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(e.request, clone);
            });
          }
          return res;
        });
      })
    );
    return;
  }

  // --- App shell (HTML/CSS/JS): Cache First, fallback to network ---
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request).then(function(res) {
        if (res.ok && url.origin === self.location.origin) {
          var clone = res.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, clone);
          });
        }
        return res;
      });
    }).catch(function() {
      // Offline fallback for navigation requests
      if (e.request.mode === 'navigate') {
        return caches.match('/app.html').then(function(cached) {
          if (cached) return cached;
          // Ultimate fallback — offline page
          return new Response(
            '<!DOCTYPE html><html lang="fil"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<title>Patrol — Offline</title>' +
            '<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#F0F2F5;color:#050505;text-align:center;padding:20px}' +
            '.box{max-width:320px}.emoji{font-size:64px;margin-bottom:16px}.title{font-size:20px;font-weight:700;margin-bottom:8px}.msg{font-size:15px;color:#65676B;line-height:1.5}</style></head>' +
            '<body><div class="box"><div class="emoji">\uD83D\uDCF5</div><div class="title">Offline ka ngayon</div>' +
            '<div class="msg">Huwag mag-alala \u2014 sine-save namin lahat.<br>Mag-sync kapag may signal na.</div></div></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        });
      }
    })
  );
});
