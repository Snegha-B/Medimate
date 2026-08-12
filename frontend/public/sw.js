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

  const url = new URL(event.request.url);

  // Don't intercept API requests, browser extensions, or Vite HMR/dev server internal modules
  if (
    url.pathname.startsWith('/api/') ||
    url.protocol.startsWith('chrome-extension') ||
    url.pathname.includes('@vite') ||
    url.pathname.includes('@react-refresh') ||
    url.search.includes('t=')
  ) {
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
      }).catch(() => {
        return cachedResponse || new Response('Network error occurred', { status: 480, statusText: 'Offline' });
      });

      return cachedResponse || fetchPromise;
    })
  );
});

// Web Push Notification Handler
self.addEventListener('push', (event) => {
  console.log('[Push Debug]');
  console.log('Service worker registered: YES');
  console.log('Push event received: YES');
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
    self.registration.showNotification(payload.title, options).then(() => {
      console.log('System notification displayed: YES');
    })
  );
});

// Notification Click Event Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const action = event.action;
  const data = event.notification.data || {};
  const targetUrl = data.url || '/';
  const scheduleId = data.scheduleId;

  const handleBackendAction = async () => {
    if (!scheduleId) return;

    // Retrieve authentication token stored in localStorage (available to SW client windows)
    // For direct service worker calls, we can try to fetch the client token or pass it
    // Service Worker doesn't have direct access to localStorage, but we can look for clients or rely on session cookies/Token header
    // We'll perform the API request. Since DRF Token is stored, we'll try to let the page handle it if a client is open.
    // If not, we will attempt the request directly.
    try {
      let endpoint = '';
      if (action === 'take') {
        endpoint = `/api/reminders/${scheduleId}/taken/`;
      } else if (action === 'snooze') {
        endpoint = `/api/reminders/${scheduleId}/snooze/`;
      } else if (action === 'skip') {
        endpoint = `/api/reminders/${scheduleId}/skip/`;
      }
      
      if (endpoint) {
        // Fetch from backend (cookies/session auth will propagate if configured, or client will catch on focus)
        await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });
      }
    } catch (err) {
      console.error('[SW] Action API call failed:', err);
    }
  };

  event.waitUntil(
    Promise.all([
      handleBackendAction(),
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.postMessage({
              type: 'NOTIFICATION_ACTION',
              action: action || 'open',
              scheduleId: scheduleId
            });
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
    ])
  );
});
