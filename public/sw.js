// Service Worker for Bistro Buzzer PWA
// Handles: caching, offline support, push notifications, message handling

// Cache version for updates
const CACHE_VERSION = 'v1';
const CACHE_NAME = `bistro-buzzer-${CACHE_VERSION}`;

// Files to cache on install
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install event: pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache).catch(() => {
        // Some resources may not exist during install – that's okay
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate event: clean up old cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event: network-first with cache fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and API calls (API calls use network-first below)
  if (request.method !== 'GET') {
    return;
  }

  // Network-first for API calls (ensure fresh data)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful API responses
          if (response.ok) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(request).then((response) => {
      return (
        response ||
        fetch(request)
          .then((response) => {
            // Cache successful responses
            if (response.ok) {
              const cloned = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
            }
            return response;
          })
          .catch(() => {
            // Fallback for offline navigation
            if (request.destination === 'document') {
              return caches.match('/index.html');
            }
            return null;
          })
      );
    })
  );
});

// ─── Push Notification Handler ───────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    // Fallback if push data is plain text
    payload = {
      title: 'Bistro Buzzer',
      body: event.data.text(),
    };
  }

  const { title, body, icon, badge, data } = payload;

  const notificationOptions = {
    body: body || '',
    icon: icon || '/icons/icon-192.png',
    badge: badge || '/icons/badge-72.png',
    tag: data?.orderId ? `order-${data.orderId}` : 'bistro-buzzer',
    renotify: true,
    requireInteraction: true, // Keep visible until user acts
    data: {
      ...data,
      url: data?.url || '/',
      timestamp: Date.now(),
    },
    vibrate: [200, 100, 200], // Vibration pattern for mobile
  };

  event.waitUntil(
    self.registration.showNotification(title || 'Bistro Buzzer', notificationOptions)
  );
});

// ─── Notification Click Handler ──────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Try to focus existing window with order page
      const orderClient = windowClients.find((c) => c.url.includes('/order/'));
      if (orderClient && 'focus' in orderClient) {
        orderClient.postMessage({
          type: 'NOTIFICATION_CLICKED',
          orderId: event.notification.data?.orderId,
        });
        return orderClient.focus();
      }

      // Otherwise, open new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// ─── Notification Close Handler (optional analytics) ──────────────────────
self.addEventListener('notificationclose', (event) => {
  // Could log dismissal for analytics
  console.log('[SW] Notification closed:', event.notification.data?.orderId);
});

// ─── Message Handler (for communication from client) ──────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
