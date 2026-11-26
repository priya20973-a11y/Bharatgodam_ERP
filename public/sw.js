const STATIC_CACHE = 'bharatgodam-static-v2';
const OFFLINE_CACHE = 'bharatgodam-offline-v2';
const OFFLINE_URL = '/offline';

async function precacheOfflineWorkspace() {
  const response = await fetch(OFFLINE_URL, { cache: 'no-store' });
  if (!response.ok || response.type !== 'basic') {
    throw new Error(`Unable to precache offline workspace (${response.status}).`);
  }

  const offlineCache = await caches.open(OFFLINE_CACHE);
  await offlineCache.put(OFFLINE_URL, response.clone());

  const html = await response.text();
  const assets = new Set();
  for (const match of html.matchAll(/(?:src|href)=["']([^"']*\/_next\/static\/[^"']+)["']/g)) {
    const asset = new URL(match[1], self.location.origin);
    if (asset.origin === self.location.origin && asset.pathname.startsWith('/_next/static/')) {
      assets.add(asset.href);
    }
  }

  if (assets.size === 0) {
    throw new Error('Offline workspace did not reference any Next.js static assets.');
  }

  const staticCache = await caches.open(STATIC_CACHE);
  await Promise.all(
    Array.from(assets, async (asset) => {
      const assetResponse = await fetch(asset, { cache: 'no-store' });
      if (!assetResponse.ok || assetResponse.type !== 'basic') {
        throw new Error(`Unable to precache offline asset ${asset} (${assetResponse.status}).`);
      }
      await staticCache.put(asset, assetResponse);
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    precacheOfflineWorkspace()
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith('bharatgodam-') &&
                key !== STATIC_CACHE &&
                key !== OFFLINE_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/data/') ||
    request.headers.has('next-action') ||
    request.headers.has('authorization')
  ) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(async () => {
        const offlinePage = await caches.match(OFFLINE_URL);
        return (
          offlinePage ||
          new Response('Offline workspace is not available yet.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        );
      }),
    );
    return;
  }

  const isStaticAsset =
    url.pathname.startsWith('/_next/static/') ||
    /\.(?:css|font|gif|ico|jpe?g|js|png|svg|webp|woff2?)$/i.test(url.pathname);

  if (!isStaticAsset) return;

  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cachedResponse = await cache.match(request);
      if (cachedResponse) return cachedResponse;

      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        await cache.put(request, response.clone());
      }
      return response;
    }),
  );
});
