const CACHE_NAME = 'medimate-app-shell-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/favicon.svg'
];

// Install Event - Pre-cache App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching App Shell assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Stale-while-revalidate strategy for UI & app shell
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Don't intercept API requests or browser extensions
  if (event.request.url.includes('/api/') || event.request.url.startsWith('chrome-extension')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

// Web Push Notification Handler
self.addEventListener('push', (event) => {
  let payload = {
    title: 'MediMate Reminder',
    body: 'Time to check your medication schedule!',
    icon: '/icons/icon-192.png',
    data: { url: '/' }
  };

  if (event.data) {
    try {
      payload = event.data.json();
    } catch (e) {
      payload.body = event.data.text();
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [200, 100, 200, 100, 200],
    data: payload.data || { url: '/' },
    tag: payload.tag || 'medimate-reminder',
    renotify: true,
    requireInteraction: true,
    actions: [
      { action: 'take', title: '✅ Take Now' },
      { action: 'snooze', title: '⏰ Snooze' },
      { action: 'skip', title: '⏭ Skip' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

// Notification Click Event Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const action = event.action;
  const data = event.notification.data || {};
  const targetUrl = data.url || '/';

  // For all actions, focus or open the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to find an existing MediMate window and focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          // Post the action to the client so the app can handle it
          client.postMessage({
            type: 'NOTIFICATION_ACTION',
            action: action || 'open',
            scheduleId: data.scheduleId
          });
          return client.focus();
        }
      }
      // No existing window — open a new one
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
