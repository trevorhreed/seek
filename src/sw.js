// Precaches the app and its data on install so search works offline; the build stamps the version and file
// list (minus the files in CACHE_ON_USE), and a new version replaces the old cache.

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

// Files only some visitors need (the meaning-search vectors) are cached the first time they're fetched
// instead of on install, so they work offline afterwards without adding to everyone's first visit.
const CACHE_ON_USE = ['/data/vectors.bin']

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== location.origin) return
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then(async cached => {
    if (cached) return cached
    const response = await fetch(event.request)
    if (response.ok && CACHE_ON_USE.some(path => url.pathname.endsWith(path))) {
      const cache = await caches.open(CACHE)
      await cache.put(event.request, response.clone())
    }
    return response
  }))
})
