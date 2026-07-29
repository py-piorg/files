/* Triple A Gas Service Worker — PWA & Offline Support */
const CACHE_NAME = 'triple-a-gas-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/admin.html',
  '/products.html',
  '/contact.html',
  '/about.html',
  '/find-us.html',
  '/safety.html',
  '/accra.html',
  '/antoa.html',
  '/bonwire.html',
  '/bogoso.html',
  '/prestea.html',
  '/site-polish.css',
  '/apple-design.css',
  '/modern-pages.css',
  '/public-luxury.css',
  '/firebase-db.js',
  '/images/offical_logo.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(err => console.warn('PWA Cache prefetch warning:', err));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Only cache GET requests, skip Firestore / API requests for dynamic handling
  if (event.request.method !== 'GET' || event.request.url.includes('firestore.googleapis.com') || event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        }
        return networkResponse;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
