/* המחברת שלי — Service Worker
 * אסטרטגיה (עודכן 20.10.2026 — מדידה הראתה שהגרסה הקודמת האטה כניסה חוזרת ל-~3 שנ'):
 *  - בקשות ניווט (הדף הראשי): network-first — תמיד הגרסה האחרונה מ-GitHub; נפילה למטמון באופליין.
 *  - קבצים עם מספר גרסה (?v=N): cache-first, בלי בדיקה ברקע. כתובת עם ?v= לא משתנה לעולם —
 *    כשהקוד משתנה מקפיצים את המספר ב-index.html, והדף הראשי (שתמיד טרי) מבקש את הכתובת החדשה.
 *    ⚠️ לכן: שינוי בקובץ בלי הקפצת ?v= לא יגיע למחשבים שכבר ביקרו. (בגרסה הקודמת stale-while-revalidate
 *    בדק כ-240 קבצים מול הרשת בכל טעינה — זה מה שהאט.)
 *  - קבצים בלי מספר גרסה (manifest, אייקונים, ספריות vendor קבועות): stale-while-revalidate.
 *  - בקשות חוצות-מקור (Firestore וכו'): לא מיירטים.
 *  הנתונים שלך נשמרים בענן (Firestore) — ה-SW שומר רק את *קוד* האפליקציה.
 */
const CACHE = "mahberet-shell-v3";
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

// מוחק מהמטמון גרסאות קודמות של אותו קובץ (אותו נתיב, ?v= אחר) — שהמטמון לא יתנפח
async function pruneOldVersions(cache, url) {
  const keys = await cache.keys();
  await Promise.all(keys.map((k) => {
    const u = new URL(k.url);
    return (u.pathname === url.pathname && u.search !== url.search) ? cache.delete(k) : null;
  }));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // לא מיירטים בקשות חוצות-מקור, וגם לא בדיקת-הגרסה של הדף (?nosw=1 — תמיד מהרשת, לא נשמרת)
  if (url.origin !== self.location.origin) return;
  if (url.searchParams.has("nosw")) return;

  // ניווט: רשת תחילה (תוכן טרי), נפילה ל-index.html מהמטמון באופליין
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

  // קבצים עם מספר גרסה: מטמון תחילה, רשת רק בפעם הראשונה
  if (url.searchParams.has("v")) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          if (cached) return cached;
          return fetch(req).then((res) => {
            if (res && res.status === 200 && res.type === "basic") {
              const copy = res.clone();
              event.waitUntil(cache.put(req, copy).then(() => pruneOldVersions(cache, url)).catch(() => {}));
            }
            return res;
          });
        })
      )
    );
    return;
  }

  // שאר הקבצים (בלי מספר גרסה): stale-while-revalidate
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
