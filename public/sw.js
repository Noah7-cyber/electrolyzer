const CACHE_NAME = 'alpha9-cache-v1';

// We'll cache all these core files initially
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(ASSETS_TO_CACHE);
            })
    );
});

self.addEventListener('fetch', event => {
    // Stale-while-revalidate strategy
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            const fetchPromise = fetch(event.request).then(networkResponse => {
                // Update the cache with the new network response
                caches.open(CACHE_NAME).then(cache => {
                    // Only cache valid GET responses
                    if (event.request.method === 'GET' && networkResponse.ok) {
                        cache.put(event.request, networkResponse.clone());
                    }
                });
                return networkResponse;
            }).catch(() => {
                // If fetch fails (e.g. offline), just return the cached response
            });

            // Return cached response immediately if available, otherwise wait for network
            return cachedResponse || fetchPromise;
        })
    );
});
