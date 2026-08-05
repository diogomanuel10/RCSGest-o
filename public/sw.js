// Service worker da Rumia.
// Web Push (notificações com o browser fechado) + uma cache mínima do próprio
// site, para a app abrir sem rede.
//
// Porquê a cache: o atleta precisa do cartão QR à ENTRADA do pavilhão, que é
// onde o wifi é pior. Sem isto a app nem chegava a arrancar e o cartão não
// existia — logo no sítio e no momento em que faz falta.
//
// Estratégia: rede primeiro, cache como recurso. O conteúdo continua sempre
// fresco quando há ligação (nunca se serve uma versão velha a quem tem rede);
// a cópia guardada só entra em jogo quando a rede falha.

const CACHE = 'rumia-app-v1';

// Só se guarda o PRÓPRIO site. Os pedidos ao Supabase são de outra origem e
// ficam de fora: dados de treinos e presenças nunca devem ser servidos de uma
// cópia velha, e o login muito menos.
function isCacheable(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return true;
}

self.addEventListener('fetch', (e) => {
  if (!isCacheable(e.request)) {
    e.respondWith(fetch(e.request));
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Guarda a cópia mais recente (só respostas boas e completas).
        if (res && res.ok && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(e.request);
        if (hit) return hit;
        // Numa navegação (abrir a app) devolve-se a página de entrada: o
        // router é do lado do cliente, portanto qualquer endereço serve.
        if (e.request.mode === 'navigate') {
          const shell = await caches.match('/index.html') || await caches.match('/');
          if (shell) return shell;
        }
        throw new Error('offline');
      })
  );
});

// Assumir o controlo já, sem esperar por uma segunda visita. Sem isto, a
// PRIMEIRA visita não passava pelo service worker e não guardava nada — o
// atleta que instalasse a app e fosse logo para o pavilhão ficava sem cartão.
self.addEventListener('install', (e) => e.waitUntil(self.skipWaiting()));

// Limpa versões antigas da cache e passa a controlar as páginas já abertas.
self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// Recebe uma notificação push vinda do servidor (Edge Function futura).
// O payload deve ser JSON com: { title, body, data?, tag? }
self.addEventListener('push', (e) => {
  if (!e.data) return;
  let payload;
  try { payload = e.data.json(); } catch { return; }

  e.waitUntil(
    self.registration.showNotification(payload.title || 'Rumia', {
      body:     payload.body || '',
      icon:     '/logo-192.png',
      badge:    '/logo-192.png',
      data:     payload.data || {},
      tag:      payload.tag  || 'rcs-notif',
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
