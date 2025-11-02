const CACHE_VERSION = 'v3'; // Увеличивайте при каждом деплое
const CACHE_NAME = `tap-game-${CACHE_VERSION}`;
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache', CACHE_NAME);
        return cache.addAll(urlsToCache);
      })
      .catch((err) => {
        console.error('Cache addAll failed:', err);
      })
  );
  self.skipWaiting(); // Немедленно активировать новый SW
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim(); // Немедленно взять контроль
    })
  );
});

// Fetch event - упрощенная стратегия с приоритетом сети
self.addEventListener('fetch', (event) => {
  // Пропускаем запросы к внешним ресурсам (CDN)
  if (event.request.url.includes('cdn.jsdelivr.net') || 
      event.request.url.includes('cdnjs.cloudflare.com')) {
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Если сетевой запрос успешен, обновляем кэш в фоне
        if (response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Если сеть недоступна, берем из кэша
        return caches.match(event.request).then((response) => {
          if (response) {
            return response;
          }
          // Если это навигация и ничего нет в кэше
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});

