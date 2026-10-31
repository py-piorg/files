/* Triple A Gas Service Worker — offline fallback only.
   Network first for our own files so price, order and portal updates show
   immediately; the cache is only used when there is no connection. */
const CACHE_NAME = 'triple-a-gas-v4';
const ASSETS = [
  '/',
  '/index.html',
  '/order.html',
  '/products.html',
  '/stations.html',
  '/safety.html',
  '/faq.html',
  '/about.html',
  '/contact.html',
  '/css/tokens.css',
  '/css/public.css',
  '/js/site-config.js',
  '/js/company-info.js',
  '/js/i18n.js',
  '/js/main.js',
  '/js/tag-common.js',
  '/js/order-form.js',
  '/js/site-live.js',
  '/images/offical_logo.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS).catch(err => console.warn('PWA cache prefetch warning:', err)))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Only handle our own GET requests; Firebase, CDNs and the staff portal always go to the network.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/admin')) return;

  event.respondWith(
    fetch(event.request).then(res => {
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      }
      return res;
    }).catch(() => caches.match(event.request).then(c => c || caches.match('/index.html')))
  );
});
