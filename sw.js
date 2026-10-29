// Offline support: cache the app shell, serve cache-first, refresh in the background.
const CACHE = 'planetgrowth-v21';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/main.js',
  './js/sim.js',
  './js/globe.js',
  './js/icons.js',
  './js/merge.js',
  './js/ui/util.js',
  './js/ui/store.js',
  './js/ui/feedback.js',
  './js/ui/world.js',
  './js/ui/themes.js',
  './js/ui/tasks.js',
  './js/ui/goals.js',
  './js/ui/systems.js',
  './js/ui/stats.js',
  './js/ui/history.js',
  './js/ui/calendar.js',
  './js/ui/cataclysm.js',
  './js/ui/focus.js',
  './js/ui/settings.js',
  './js/ui/layout.js',
  './js/ui/render.js',
  './js/ui/keywords.js',
  './js/ui/tutorial.js',
  './js/ui/reminders.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const net = fetch(e.request).then((res) => {
        if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});

// Tapping a reminder brings the app to the front, or opens it.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => 'focus' in c);
    return open ? open.focus() : self.clients.openWindow('./');
  }));
});
