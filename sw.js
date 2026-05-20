/* VieForce Patrol — app shell cache-first (same-origin static assets only).
 * API / Supabase / map tiles are never intercepted (network-only).
 */
var SHELL_CACHE = 'patrol-shell-v4';

function isShellAsset(urlStr) {
  try {
    var u = new URL(urlStr);
    if (u.origin !== self.location.origin) return false;
    var p = u.pathname || '';
    if (p === '/' || p === '/index.html' || p === '/app.html') return true;
    if (/\.html$/i.test(p)) return true;
    if (p.indexOf('/css/') === 0 || p.indexOf('/js/') === 0 || p.indexOf('/icons/') === 0) return true;
    if (/\/manifest\.json$/i.test(p)) return true;
    return false;
  } catch (e) {
    return false;
  }
}

self.addEventListener('install', function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== SHELL_CACHE) return caches.delete(key);
          return Promise.resolve();
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  if (!isShellAsset(req.url)) return;

  event.respondWith(
    caches.open(SHELL_CACHE).then(function (cache) {
      return cache.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          try {
            if (res && res.status === 200 && res.type === 'basic') {
              cache.put(req, res.clone());
            }
          } catch (e) {}
          return res;
        });
      });
    })
  );
});
