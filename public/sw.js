/*
 * ServisGo service worker.
 *
 * It is what makes the app installable — Android, iOS, Windows and macOS all
 * want a manifest plus a fetch handler before they will offer "install" — and
 * it keeps the shell openable when a technician loses signal on site.
 *
 * Nothing from Supabase is cached: data is always live, only the app itself is
 * stored. Bump CACHE_VERSION when the caching rules below change; the old
 * caches are dropped on activate.
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `servisgo-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `servisgo-assets-${CACHE_VERSION}`;
const FONT_CACHE = `servisgo-fonts-${CACHE_VERSION}`;
const KEEP = [SHELL_CACHE, ASSET_CACHE, FONT_CACHE];

/** Enough to open the app offline; the hashed build assets arrive at runtime. */
const SHELL = [
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // one bad URL must not fail the whole install
      .then(cache => Promise.allSettled(SHELL.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => !KEEP.includes(key)).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

/** Network first, falling back to the cached shell — used for page loads. */
async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    // a redirected response cannot be replayed for a navigation later on
    if (response && response.ok && !response.redirected) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put('/', response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    return (await cache.match('/')) || (await cache.match('/offline.html')) || Response.error();
  }
}

/** Cache first — build assets carry a content hash, so a hit is always right. */
async function handleAsset(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
  return response;
}

/** Serve what we have, refresh it in the background — icons, manifest, images. */
async function handleStatic(request) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then(response => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => hit);
  return hit || network;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Supabase (and anything else on another origin) always goes to the network.
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (isFont) {
    event.respondWith(handleAsset(request, FONT_CACHE));
    return;
  }
  if (!sameOrigin) return;
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(handleAsset(request, ASSET_CACHE));
    return;
  }
  if (/\.(png|svg|ico|webmanifest|woff2?)$/.test(url.pathname)) {
    event.respondWith(handleStatic(request));
  }
});
