// Service worker da Central RCS.
// Sem caching (conteúdo sempre fresco), com suporte a Web Push para
// notificações nativas quando o browser/app está fechado.

self.addEventListener('fetch', (e) => e.respondWith(fetch(e.request)));

// Recebe uma notificação push vinda do servidor (Edge Function futura).
// O payload deve ser JSON com: { title, body, data?, tag? }
self.addEventListener('push', (e) => {
  if (!e.data) return;
  let payload;
  try { payload = e.data.json(); } catch { return; }

  e.waitUntil(
    self.registration.showNotification(payload.title || 'Central RCS', {
      body:     payload.body  || '',
      icon:     '/logo.svg',
      badge:    '/logo.svg',
      data:     payload.data  || {},
      tag:      payload.tag   || 'rcs-notif',
      renotify: false,
    })
  );
});

// Ao clicar na notificação: foca a janela da app (ou abre uma nova).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => {
        const existing = list.find((c) =>
          c.url.startsWith(self.registration.scope)
        );
        return existing ? existing.focus() : clients.openWindow('/');
      })
  );
});
