// VieForce Patrol — Service Worker v9
// Domain: patrol.vienovo.ph
// External requests: NO interception (Supabase, Mapbox, CDN pass through)
// Navigation: Network first, offline fallback
// App shell JS/CSS: Cache first, network fallback

var CACHE_NAME = 'patrol-v9';
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
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // NEVER intercept: Supabase, Mapbox, CDN, external APIs
  if (url.indexOf('supabase.co') > -1 ||
      url.indexOf('mapbox.com') > -1 ||
      url.indexOf('unpkg.com') > -1 ||
      url.indexOf('jsdelivr.net') > -1 ||
      url.indexOf('fonts.googleapis.com') > -1 ||
      url.indexOf('fonts.gstatic.com') > -1 ||
      url.indexOf('api.') > -1) {
    return; // let browser handle normally, no SW interference
  }

  // For navigation requests: network first, offline fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(function() {
          return caches.match('/app.html') || caches.match('/index.html');
        })
    );
    return;
  }

  // Everything else (app shell JS/CSS): cache first, network fallback
  event.respondWith(
    caches.match(event.request)
      .then(function(cached) {
        return cached || fetch(event.request);
      })
      .catch(function() {
        if (event.request.destination === 'document') {
          return caches.match('/app.html');
        }
      })
  );
});
