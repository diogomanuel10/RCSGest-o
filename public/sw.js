// Service worker mínimo: passa tudo para a rede sem caching.
// Existência deste handler é suficiente para o Chrome considerar a app
// instalável (critério PWA) sem introduzir risco de conteúdo desatualizado.
self.addEventListener('fetch', (e) => e.respondWith(fetch(e.request)));
