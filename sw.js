// Bump CACHE when you change any file below, or phones will keep serving the old copy.
const CACHE = 'passport-framer-v6';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* The app shell goes network-first. It used to be cache-first like everything else,
   which meant a redeploy landed one launch late: the phone served the previous copy,
   folded the new one into the cache behind it, and the change only appeared the next
   time the app was opened. That is indistinguishable from the change not working.
   Falling back to cache on failure - and on a slow network - keeps it usable offline,
   which is the whole reason the service worker is here. */
const NET_TIMEOUT = 3000;

function shellFirst(req){
  return new Promise(resolve => {
    let settled = false;
    const done = r => { if(!settled){ settled = true; resolve(r); } };

    // Flaky signal should not leave the app on a blank screen waiting.
    const timer = setTimeout(() => {
      caches.match(req).then(hit => { if(hit) done(hit); });
    }, NET_TIMEOUT);

    fetch(req).then(res => {
      clearTimeout(timer);
      if(res && res.status === 200){
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      done(res);
    }).catch(() => {
      clearTimeout(timer);
      caches.match(req).then(hit => done(hit || caches.match('./')));
    });
  });
}

// Cache first for everything else: icons and the manifest are static and the point
// is that the app opens with no signal. Network results are folded back in.
function assetFirst(req){
  return caches.match(req).then(hit => {
    const live = fetch(req).then(res => {
      if(res && res.status === 200 && res.type === 'basic'){
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => hit);
    return hit || live;
  });
}

self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  const isShell = e.request.mode === 'navigate' ||
                  e.request.destination === 'document' ||
                  new URL(e.request.url).pathname.replace(/\/$/, '').endsWith('/index.html');
  e.respondWith(isShell ? shellFirst(e.request) : assetFirst(e.request));
});
