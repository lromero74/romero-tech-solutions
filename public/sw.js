const CACHE_NAME = 'romero-tech-v1.3.1';
const STATIC_CACHE_NAME = 'romero-tech-static-v1.3.1';
const DYNAMIC_CACHE_NAME = 'romero-tech-dynamic-v1.3.1';

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

    // Static assets - Cache First strategy
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

function isStaticAsset(pathname) {
  return STATIC_ASSETS.includes(pathname) ||
         pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|css|js|woff|woff2)$/);
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