/* Service worker do Hubify.
   1) Deixa o app instalável (PWA) e rápido de abrir: guarda a "casca" do site (HTML, JS, CSS, fontes, ícones).
      Conversas, API e chamadas sempre vão direto ao servidor.
   2) Recebe as notificações push e mostra o aviso do sistema mesmo com o app fechado. */
const CACHE = 'hubify-shell-v2';
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/badge-96.png'];
const LIVE = ['/api', '/socket.io', '/push', '/ice-servers', '/hubify-ca.crt'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Dados ao vivo nunca passam pelo cache
  if (LIVE.some((p) => url.pathname === p || url.pathname.startsWith(p + '/'))) return;

  // Páginas: rede primeiro (pega a versão nova); sem rede, usa a casca guardada
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Arquivos com hash no nome (/assets/...) não mudam: cache primeiro
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
        return res;
      }))
    );
    return;
  }

  // Demais arquivos estáticos: entrega o guardado e atualiza por trás
  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
        return res;
      }).catch(() => hit);
      return hit || network;
    })
  );
});

/* ---------- Notificações push ---------- */

const isIOS = /iPad|iPhone|iPod/.test(self.navigator.userAgent);
const windows = () => self.clients.matchAll({ type: 'window', includeUncontrolled: true });

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : '' }; }

  event.waitUntil((async () => {
    // Com o Hubify aberto e em foco, o próprio app já avisa (som, selo, aviso na tela).
    // No iPhone toda entrega precisa virar notificação, senão o sistema cancela a permissão.
    const open = await windows();
    if (!isIOS && open.some((c) => c.visibilityState === 'visible' && c.focused)) return;

    await self.registration.showNotification(data.title || 'Hubify', {
      body: data.body || '',
      tag: data.tag,                 // mesma conversa = uma notificação só, atualizada
      renotify: !!data.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      lang: 'pt-BR',
      requireInteraction: !!data.requireInteraction,
      actions: Array.isArray(data.actions) ? data.actions.slice(0, 2) : [],
      data: { url: data.url || '/', kind: data.kind || 'message' },
    });
  })());
});

// Toque na notificação: traz a janela do app para frente (ou abre uma) já na conversa/reunião certa
self.addEventListener('notificationclick', (event) => {
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.notification.close();
  event.waitUntil((async () => {
    const open = await windows();
    const client = open.find((c) => new URL(c.url).origin === self.location.origin);
    if (client) {
      try { await client.focus(); } catch { /* alguns navegadores só focam com gesto */ }
      client.postMessage({ type: 'hubify:navigate', url: target });
      return;
    }
    await self.clients.openWindow(target);
  })());
});

// O navegador trocou a assinatura por conta própria: avisa o app aberto para registrar a nova
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(windows().then((open) => open.forEach((c) => c.postMessage({ type: 'hubify:resubscribe' }))));
});
