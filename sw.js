const STATIC_CACHE = 'flashcards-static-v4';
const RUNTIME_CACHE = 'flashcards-runtime-v4';
const API_CACHE = 'flashcards-api-v4';

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './js/app-globals.js',
  './js/core-utils.js',
  './js/review-panel.js',
  './js/server-communication.js',
  './js/data-access.js',
  './js/device-interactions.js',
  './js/navigation-layout.js',
  './js/text-rendering.js',
  './js/media-handling.js',
  './js/sidebar-subject-management.js',
  './js/subject-topic-panel.js',
  './js/editor-panel.js',
  './js/deck-search-panel.js',
  './js/study-session.js',
  './js/settings-management.js',
  './js/bootstrap.js',
  './icons/icon.png',
  './icons/apple-touch-icon.png'
];

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

function isVersionSensitiveAsset(url) {
  const path = String(url.pathname || '');
  return path.endsWith('.css')
    || path.endsWith('.js')
    || path.endsWith('.html')
    || path.startsWith('/js/');
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map(name => {
      if ([STATIC_CACHE, RUNTIME_CACHE, API_CACHE].includes(name)) return Promise.resolve();
      return caches.delete(name);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!isSameOrigin(url)) return;

  if (isApiRequest(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(API_CACHE);
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      } catch (_) {
        const cached = await cache.match(request);
        if (cached) return cached;
        return new Response(JSON.stringify({ error: 'offline-no-cache' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    })());
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          cache.put('./index.html', response.clone());
        }
        return response;
      } catch (_) {
        const cached = await cache.match('./index.html');
        if (cached) return cached;
        throw _;
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(request);
    const fetchPromise = fetch(request).then(response => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    }).catch(() => null);

    if (isVersionSensitiveAsset(url)) {
      const network = await fetchPromise;
      if (network) return network;
      if (cached) return cached;
      const shell = await caches.match('./index.html');
      if (shell) return shell;
      return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }

    if (cached) return cached;
    const network = await fetchPromise;
    if (network) return network;
    const shell = await caches.match('./index.html');
    if (shell) return shell;
    return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  })());
});
