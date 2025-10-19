const CACHE_NAME = 'romero-tech-v1.101.53';
const STATIC_CACHE_NAME = 'romero-tech-static-v1.101.53';
const DYNAMIC_CACHE_NAME = 'romero-tech-dynamic-v1.101.53';

// Resources to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png',
  '/favicon.ico',
  '/robots.txt',
  '/site.webmanifest',
];

// API endpoints to cache dynamically
const API_CACHE_PATTERNS = [
  /^\/api\/translations/,
  /^\/api\/system-settings/,
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('SW: Installing service worker...');

  event.waitUntil(
    Promise.all([
      // Cache static assets
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        console.log('SW: Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      }),
      // Force activation of new service worker
      self.skipWaiting()
    ])
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('SW: Activating service worker...');

  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE_NAME &&
                cacheName !== DYNAMIC_CACHE_NAME &&
                cacheName !== CACHE_NAME) {
              console.log('SW: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Take control of all clients
      self.clients.claim()
    ])
  );
});

// Fetch event - handle requests with caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  event.respondWith(handleRequest(request));
});

async function handleRequest(request) {
  const url = new URL(request.url);

  try {
    // Skip caching for security-sensitive endpoints
    if (isSecurityEndpoint(url.pathname)) {
      return await fetch(request);
    }

    // JavaScript and CSS - Network First to prevent serving stale code
    if (isAppCodeAsset(url.pathname)) {
      return await networkFirst(request, DYNAMIC_CACHE_NAME);
    }

    // Static assets (images, fonts, etc.) - Cache First strategy
    if (isStaticAsset(url.pathname)) {
      return await cacheFirst(request, STATIC_CACHE_NAME);
    }

    // API requests - Network First with cache fallback
    if (url.pathname.startsWith('/api/')) {
      return await networkFirst(request, DYNAMIC_CACHE_NAME);
    }

    // HTML pages - Network First with cache fallback
    if (request.headers.get('accept')?.includes('text/html')) {
      return await networkFirst(request, DYNAMIC_CACHE_NAME);
    }

    // Everything else - Network only
    return await fetch(request);

  } catch (error) {
    console.error('SW: Request failed:', error);

    // Return offline fallback for HTML pages
    if (request.headers.get('accept')?.includes('text/html')) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      return await cache.match('/index.html') || new Response('Offline', { status: 503 });
    }

    throw error;
  }
}

// Cache First strategy - check cache first, fallback to network
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) {
    console.log('SW: Serving from cache:', request.url);
    return cached;
  }

  console.log('SW: Fetching and caching:', request.url);
  const response = await fetch(request);

  if (response.ok) {
    cache.put(request, response.clone());
  }

  return response;
}

// Network First strategy - try network first, fallback to cache
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    console.log('SW: Fetching from network:', request.url);
    const response = await fetch(request);

    if (response.ok && shouldCache(request)) {
      console.log('SW: Caching response:', request.url);
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    console.log('SW: Network failed, checking cache:', request.url);
    const cached = await cache.match(request);

    if (cached) {
      console.log('SW: Serving from cache:', request.url);
      return cached;
    }

    throw error;
  }
}

// Helper functions
function isSecurityEndpoint(pathname) {
  // Never cache these security-sensitive endpoints
  const securityEndpoints = [
    '/api/csrf-token',
    '/api/auth/',
    '/api/login',
    '/api/logout',
    '/api/signup',
    '/api/verify-email',
    '/api/reset-password',
    '/api/mfa/',
  ];

  return securityEndpoints.some(endpoint => pathname.includes(endpoint));
}

function isAppCodeAsset(pathname) {
  // JS and CSS files that contain app code - use Network First
  return pathname.match(/\.(js|css)$/);
}

function isStaticAsset(pathname) {
  // Images, fonts, and other static assets - use Cache First
  return STATIC_ASSETS.includes(pathname) ||
         pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|woff|woff2)$/);
}

function shouldCache(request) {
  const url = new URL(request.url);

  // Cache API responses for translations and settings
  if (API_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname))) {
    return true;
  }

  // Cache successful responses only
  return false;
}

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('SW: Received SKIP_WAITING message');
    self.skipWaiting();
  }
});

// Push notification event handlers
self.addEventListener('push', (event) => {
  console.log('SW: Push notification received');

  let notificationData = {
    title: 'Romero Tech Solutions',
    body: 'You have a new notification',
    icon: '/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png',
    badge: '/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      { action: 'view', title: 'View Details' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  // Try to get notification data from the push event
  if (event.data) {
    try {
      const payload = event.data.json();
      notificationData = {
        ...notificationData,
        ...payload
      };
    } catch (e) {
      // If JSON parsing fails, use text as body
      notificationData.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationData)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('SW: Notification clicked:', event.action);

  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  // Handle MFA code notifications specially
  if (event.notification.data?.type === 'mfa_code' && event.action === 'copy') {
    event.waitUntil(
      (async () => {
        const mfaCode = event.notification.data.code;

        // Try to copy to clipboard
        const windowClients = await clients.matchAll({
          type: 'window',
          includeUncontrolled: true
        });

        if (windowClients.length > 0) {
          const client = windowClients[0];
          client.focus();

          // Send message to client to copy the code
          client.postMessage({
            type: 'COPY_MFA_CODE',
            code: mfaCode
          });

          console.log('SW: MFA code sent to client for copying:', mfaCode);
        } else {
          // If no window is open, open one and pass the code
          if (clients.openWindow) {
            const urlToOpen = `/?mfa_code=${mfaCode}`;
            return clients.openWindow(urlToOpen);
          }
        }
      })()
    );
    return;
  }

  // Default behavior: Open the app or focus existing window
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((windowClients) => {
      // Check if there's already a window/tab open
      for (let client of windowClients) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      // If no window is open, open a new one
      if (clients.openWindow) {
        const urlToOpen = event.notification.data?.url || '/';
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Background sync for offline push subscription
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-push-subscription') {
    console.log('SW: Syncing push subscription');
    event.waitUntil(syncPushSubscription());
  }
});

async function syncPushSubscription() {
  try {
    const subscription = await self.registration.pushManager.getSubscription();
    if (subscription) {
      // Send subscription to server
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscription)
      });

      if (!response.ok) {
        throw new Error('Failed to sync subscription');
      }

      console.log('SW: Push subscription synced successfully');
    }
  } catch (error) {
    console.error('SW: Failed to sync push subscription:', error);
    throw error; // Retry later
  }
}