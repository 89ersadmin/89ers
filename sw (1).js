/**
 * 89ers Online Diner — Service Worker
 * Strategy:
 *   - App shell (HTML, fonts, icons) → Cache First
 *   - Google Apps Script API calls  → Network First (never cache)
 *   - Everything else               → Stale While Revalidate
 */

const CACHE_NAME    = '89ers-v1.0.0';
const OFFLINE_PAGE  = './index.html';

const PRECACHE_URLS = [
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// External origins that should NEVER be cached (GAS API, analytics)
const NEVER_CACHE = [
  'script.google.com',
  'script.googleusercontent.com',
  'googleapis.com',
];

// ── INSTALL: precache app shell ─────────────────────────────────────────────
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE: clean up old caches ───────────────────────────────────────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(function(key) { return key !== CACHE_NAME; })
          .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ── FETCH: routing strategy ──────────────────────────────────────────────────
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // 1. Never cache Google Apps Script or external API calls
  var neverCache = NEVER_CACHE.some(function(origin) {
    return url.hostname.includes(origin);
  });
  if (neverCache || event.request.method !== 'GET') {
    event.respondWith(fetch(event.request));
    return;
  }

  // 2. Google Fonts — Cache First (they are immutable)
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          if (cached) return cached;
          return fetch(event.request).then(function(response) {
            cache.put(event.request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }

  // 3. Unsplash images — Stale While Revalidate
  if (url.hostname.includes('unsplash.com') ||
      url.hostname.includes('images.unsplash.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          var fetchPromise = fetch(event.request).then(function(response) {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(function() { return cached; });
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // 4. App shell (same origin) — Cache First, fallback to offline page
  event.respondWith(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        }).catch(function() {
          // Offline fallback: serve index.html for navigate requests
          if (event.request.mode === 'navigate') {
            return cache.match(OFFLINE_PAGE);
          }
        });
      });
    })
  );
});

// ── BACKGROUND SYNC (optional: queue failed orders) ─────────────────────────
self.addEventListener('sync', function(event) {
  if (event.tag === 'sync-orders') {
    event.waitUntil(syncPendingOrders());
  }
});
function syncPendingOrders() {
  // placeholder — extend this if you add IndexedDB order queuing
  return Promise.resolve();
}

// ── PUSH NOTIFICATIONS (optional) ───────────────────────────────────────────
self.addEventListener('push', function(event) {
  if (!event.data) return;
  var data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || '89ers Online Diner', {
      body:    data.body    || 'Your order update is here!',
      icon:    './icons/icon-192.png',
      badge:   './icons/icon-96.png',
      vibrate: [200, 100, 200],
      data:    { url: data.url || './' }
    })
  );
});
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || './')
  );
});
