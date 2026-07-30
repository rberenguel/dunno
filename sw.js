const CACHE = 'dunno-0.5.0';
const ASSETS = [
  './', './index.html', './css/app.css',
  './js/main.js', './js/tiling.js', './js/commands.js', './js/diff.js',
  './libs/codejar.js',
];

self.addEventListener('install', e =>
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)))
);

self.addEventListener('activate', e =>
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ))
);

self.addEventListener('fetch', e =>
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)))
);
