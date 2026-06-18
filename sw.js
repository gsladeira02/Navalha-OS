const CACHE_NAME = 'navalhaos-pwa-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/login.html',
  '/dashboard.html',
  '/agenda.html',
  '/clientes.html',
  '/barbeiros.html',
  '/servicos.html',
  '/horarios.html',
  '/caixa.html',
  '/assinaturas.html',
  '/comissoes.html',
  '/configuracoes.html',
  '/css/style.css',
  '/js/config.js',
  '/js/supabase-client.js',
  '/js/ui.js',
  '/js/app.js',
  '/assets/logo.png',
  '/assets/apple-touch-icon.png',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/manifest.webmanifest'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL.map(url => new Request(url, { cache: 'reload' }))))
      .catch(() => null)
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys
      .filter(key => key !== CACHE_NAME)
      .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

function isSupabaseOrExternal(request) {
  const url = new URL(request.url);
  return url.origin !== self.location.origin || url.pathname.includes('/functions/v1/');
}

function isNavigationRequest(request) {
  return request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (isSupabaseOrExternal(request)) return;

  if (isNavigationRequest(request)) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match('/login.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        return response;
      });
    })
  );
});
