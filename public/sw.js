// Service worker da Central RCS (PWA).
//
// Faz duas coisas:
//   1. Cache do "app shell" para abrir offline e carregar mais rápido.
//   2. Recebe notificações push e abre a app no sítio certo ao clicar.
//
// Importante: NUNCA mete em cache pedidos ao Supabase (API/auth) — esses são
// cross-origin e ficam de fora do handler de fetch (só tratamos same-origin GET).

const VERSION = 'rcs-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

// Mínimo para arrancar offline. Os restantes recursos (JS/CSS com hash) entram
// em cache à medida que são pedidos (stale-while-revalidate).
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icon-maskable.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Só tratamos same-origin. Supabase, Google Fonts, etc. passam direto.
  if (url.origin !== self.location.origin) return;

  // Navegações (abrir páginas): rede primeiro, com fallback ao shell em cache.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // Restantes recursos same-origin: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// --- Notificações push ----------------------------------------------------
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Central RCS', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Central RCS';
  const options = {
    body: data.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: data.tag || undefined,
    data: { url: data.url || '/' },
    renotify: !!data.tag,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client && target !== '/') client.navigate(target).catch(() => {});
          return;
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
