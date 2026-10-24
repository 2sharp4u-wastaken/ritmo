// Offline cache for the app shell. Bump VERSION on every release.
const VERSION = 'ritmo-v6';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'onset-worklet.js', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/main.js', 'js/audio.js', 'js/calib.js', 'js/coach.js', 'js/curriculum.js', 'js/grader.js', 'js/highway.js', 'js/screens.js', 'js/session.js', 'js/store.js', 'js/ui.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // app files: network first so updates arrive, cache as fallback for offline
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return r; }).catch(() => caches.match(req).then(m => m || caches.match('index.html'))));
  } else if (/fonts\.(googleapis|gstatic)\.com/.test(url.host)) {
    e.respondWith(caches.match(req).then(m => m || fetch(req).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return r; })));
  }
});
