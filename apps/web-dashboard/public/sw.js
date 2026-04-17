// .HMAN service worker — offline shell only.
//
// Caches the built JS/CSS/HTML so the app shell still loads if the network
// is down. API calls (anything under /api/) are NEVER cached — they must
// always hit the live bridge. This keeps the freshness / security
// guarantees: cached UI, live state.

const CACHE = 'hman-shell-v1'
const SHELL = ['/', '/app', '/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)

  // Never cache API or bridge calls
  if (url.pathname.startsWith('/api/')) return

  // Only handle same-origin GETs
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  // Stale-while-revalidate for built assets
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req)
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone())
            return res
          })
          .catch(() => cached)
        return cached || network
      })
    )
    return
  }

  // Network-first for navigations; fall back to cached shell
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(req).then((r) => r || caches.match('/'))
      )
    )
  }
})
