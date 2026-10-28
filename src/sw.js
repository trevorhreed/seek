// Precaches the app and its data on install so search works offline; the build stamps the version and file
// list, and a new version replaces the old cache.

const CACHE = 'seek-__BUILD_VERSION__'
const ASSETS = '__BUILD_ASSETS__'

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(cached => cached ?? fetch(event.request))
  )
})
