// DISABLED — Service Worker causing false offline on mobile
// This SW only clears all caches and unregisters itself.
// TODO: re-enable properly after pilot launch.

self.addEventListener('install', function() {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(key) {
        console.log('Clearing cache:', key);
        return caches.delete(key);
      }));
    })
  );
});

// No fetch handler — all requests go straight to network
