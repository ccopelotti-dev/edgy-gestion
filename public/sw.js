// Fase 31b: service worker del PWA -- mismo patrón que Edgy Trading Hub.
// Cachea la cáscara de la app para que abra rápido / funcione offline
// básico, pero NUNCA intercepta pedidos a Supabase ni a ningún CDN --
// filtro por origin en el fetch handler, así los datos siempre son
// frescos y esto no interfiere con nada de la app.
//
// Importante: subir CACHE_NAME (v1 -> v2 -> v3...) en cada entrega
// grande de cambios de la app shell, si no el navegador no detecta que
// hay una versión nueva y la app instalada queda pegada a la vieja.
const CACHE_NAME = 'edgy-gestion-v1'
const APP_SHELL = ['/', '/index.html', '/icon-192.png', '/icon-512.png', '/manifest.json']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/index.html')))
    return
  }
  event.respondWith(caches.match(event.request).then((resp) => resp || fetch(event.request)))
})
