const CACHE_NAME = 'didifit-cache-v1';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/index.css',
  '/index.tsx', // Or the compiled .js file if your build process changes it
  '/manifest.json',
  '/icon-192x192.png', // Ensure you have this icon
  '/icon-512x512.png', // Ensure you have this icon
  '/apple-touch-icon.png' // Ensure you have this icon
];

// Install event: Open cache and add all URLs to cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(URLS_TO_CACHE);
      })
      .catch(err => {
        console.error('Failed to open cache or add URLs:', err);
      })
  );
  self.skipWaiting(); // Force the waiting service worker to become the active service worker.
});

// Activate event: Clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim(); // Take control of all open clients once activated.
});

// Fetch event: Serve cached content when offline, or fetch from network
self.addEventListener('fetch', event => {
  // We only want to cache GET requests.
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Cache hit - return response
        if (cachedResponse) {
          return cachedResponse;
        }

        // Not in cache - fetch from network, then cache it
        return fetch(event.request).then(
          response => {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // IMPORTANT: Clone the response. A response is a stream
            // and because we want the browser to consume the response
            // as well as the cache consuming the response, we need
            // to clone it so we have two streams.
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        ).catch(error => {
            // Network request failed, and it's not in cache.
            // For HTML pages, you might want to return a fallback offline page.
            // For now, just let the browser handle the error for non-HTML.
            if (event.request.mode === 'navigate') { // If it's a page navigation
                // Optionally, return a generic offline HTML page:
                // return caches.match('/offline.html'); 
            }
            console.error('Fetch failed; returning offline page instead.', error);
            // For other assets, the browser error will propagate.
        });
      })
  );
});
