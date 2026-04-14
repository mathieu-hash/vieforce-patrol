// VieForce Patrol — Service Worker
// Cache strategy: App shell = Cache First, API = Network First

var CACHE_NAME = 'patrol-v1';
var APP_SHELL = [
  '/',
  '/app.html',
  '/admin.html',
  '/index.html',
  '/config.js',
  '/css/patrol.css',
  '/js/supabase.js',
  '/js/auth.js',
  '/js/db.js',
  '/js/gps.js',
  '/js/camera.js',
  '/js/offline.js',
  '/js/stores.js',
  '/js/visits.js',
  '/js/visit-wizard.js',
  '/js/map.js',
  '/js/dashboard.js',
  '/js/admin.js',
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

  // Supabase API calls → Network First
  if (url.hostname.includes('supabase.co')) {
    e.respondWith(
      fetch(e.request).then(function(res) {
        // Cache successful API responses
        if (res.ok) {
          var clone = res.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, clone);
          });
        }
        return res;
      }).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }

  // CDN resources (fonts, leaflet, chart.js, supabase-js, dexie) → Cache First
  if (url.hostname.includes('cdn.jsdelivr.net') ||
      url.hostname.includes('unpkg.com') ||
      url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com') ||
      url.hostname.includes('basemaps.cartocdn.com') ||
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
        });
      })
    );
    return;
  }

  // App shell files → Cache First, fallback to network
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
      // Offline fallback — serve app.html for navigation requests
      if (e.request.mode === 'navigate') {
        return caches.match('/app.html');
      }
    })
  );
});
