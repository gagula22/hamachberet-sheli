/* המחברת שלי — Service Worker
 * אסטרטגיה:
 *  - מעטפת האפליקציה (HTML/CSS/JS/אייקונים, same-origin) נשמרת במטמון
 *    בגישת stale-while-revalidate: מוגשת מיד מהמטמון ומתעדכנת ברקע.
 *    כך האתר נטען מיידית וגם עובד כשאין רשת — מציג את הגרסה האחרונה שנשמרה.
 *  - בקשות ניווט: network-first עם נפילה ל-index.html מהמטמון (אופליין).
 *  - בקשות חוצות-מקור (Firebase / Firestore / גופנים / CDN): לא מיירטים —
 *    הדפדפן והתמשכות ה-IndexedDB של Firestore מטפלים בנתונים בעצמם.
 *  הנתונים שלך נשמרים בענן (Firestore) — ה-SW שומר רק את *קוד* האפליקציה.
 */
const CACHE = "mahberet-shell-v2";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// מאפשר לעמוד לבקש החלפת SW מיידית בעת עדכון
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // לא מיירטים בקשות חוצות-מקור (Firebase/Firestore/גופנים/CDN)
  if (url.origin !== self.location.origin) return;

  // בקשות ניווט: ננסה רשת תחילה (תוכן טרי), ניפול ל-index.html מהמטמון באופליין
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./index.html", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("./index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  // נכסים סטטיים (same-origin): stale-while-revalidate
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200 && res.type === "basic") {
              cache.put(req, res.clone());
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    )
  );
});
