(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // קבצי-ענן — אחריות עצמאית (window.CloudFiles). מאחסן קבצים מצורפים ב-Firestore
  // (לא ב-Storage) כדי לעקוף לחלוטין את חסימת ה-CORS של Storage מ-github.io.
  //
  // למה Firestore ולא Storage: האתר מתארח ב-GitHub Pages, ול-bucket של Storage
  // אין כלל-CORS למקור הזה (ואי אפשר להגדיר אותו — ה-bucket אינו נגיש בחשבון
  // של המשתמש). Firestore לא זקוק ל-CORS ומסתנכרן חלק (כמו שאר הנתונים) → זו
  // הדרך היחידה שמבטיחה שהקובץ באמת עולה לענן וזמין מכל מכשיר, בלי הגדרת-שרת.
  //
  // מבנה: מסמך-מטא `users/{uid}/attachments/{id}` = {name,type,size,mime,chunks},
  // ותת-אוסף `parts/{i}` = {b:"<base64 של ~600KB>"}. מגבלת Firestore היא 1MB
  // למסמך → מפצלים ל-chunks. המטא נכתב **אחרון**, כך שמטא שלם מבטיח שכל ה-parts
  // קיימים. הנושא שומר רק `data-fs="id"` קטן (בלי base64) → מסתנכרן במלואו
  // ואינו נחתך ע"י שומר-הגודל של firebase-sync (שחותך base64 כבד מגוף הנושא).
  //
  // ⚠️ מחוץ ל-Store/סכימה בכוונה: זה אוסף Firestore שקוראים/כותבים אליו ישירות
  // מכאן, לא דרך מנוע הסנכרון (SUBCOL_KEYS). כמו הקלטות-קול ב-IndexedDB —
  // אחסון כבד שלא מנפח את snapshot ה-Store. אין מפתח store-schema, אין אסרציה.
  //
  // עצמאי לחלוטין: media.js קורא לכאן דרך window.CloudFiles בלבד. אם Firestore
  // לא זמין (לא מחובר / SDK חסר) — enabled()=false, ו-media.js נופל חיננית
  // להטמעת base64 מקומית (ההתנהגות הקודמת) — כלום לא נשבר.
  // ─────────────────────────────────────────────────────────────────────────

  // ~900KB לכל part: מקסימום שבטוח מתחת למגבלת 1,048,576 בייט/מסמך (עם מרווח
  // ל-path+overhead), מיעוט chunks = פחות round-trips. כפולה של 4 (יישור base64).
  var CHUNK = 900 * 1024;
  // כמה parts נכתבים/נקראים במקביל — חופף round-trips ומקצר את זמן ההעלאה
  // מ-N סדרתי ל-~ceil(N/CONCURRENCY) גלים. 5 בטוח לחלוטין ל-Firestore.
  var CONCURRENCY = 5;
  // תקרת קובץ לאחסון-ענן (מעבר לזה → מקומי). מיושר ל-HARD_CAP של media.js (50MB)
  // כדי שכל קובץ שהמחברת בכלל מקבלת ייכנס לענן ויהיה זמין מכל מכשיר — קובץ
  // שנשאר מקומי הוא בדיוק התקלה של "צירפתי במחשב אחד ואין אותו בשני".
  // 50MB → ~67MB base64 → ~76 chunks; הקריאה מפענחת part-אחרי-part (fetchBlob)
  // כדי שלא תיווצר מחרוזת-ענק אחת בזיכרון.
  var FS_MAX = 50 * 1024 * 1024;

  function _fb() {
    return (window.firebase && firebase.apps && firebase.apps.length) ? firebase : null;
  }
  function _user() {
    var fb = _fb();
    try { return fb && fb.auth && fb.auth().currentUser ? fb.auth().currentUser : null; } catch (e) { return null; }
  }
  function _db() {
    var fb = _fb();
    return (fb && fb.firestore) ? fb.firestore() : null;
  }

  // האם אפשר להעלות עכשיו: SDK טעון, יש firestore, ומשתמש מחובר.
  function enabled() {
    return !!(_db() && _user() && !window.IMPROVED_SITE_SANDBOX);
  }
  // האם קובץ בטווח אחסון-הענן (מעבר לתקרה → הקורא נופל למקומי)
  function fits(size) { return size <= FS_MAX; }

  function _attRef(id) {
    var user = _user();
    return _db().doc('users/' + user.uid + '/attachments/' + id);
  }

  function _readAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result || '')); };
      r.onerror = function () { reject(new Error('read-failed')); };
      r.readAsDataURL(file);
    });
  }

  // מעלה קובץ ל-Firestore ומחזיר { id, name, type, size, fs:true }. זורק אם נכשל
  // — הקורא אחראי לנפילה חיננית. onProgress(frac) נקרא בין part ל-part.
  async function upload(file, id, onProgress) {
    if (!enabled()) throw new Error('firestore-unavailable');
    if (!fits(file.size)) { var e = new Error('too-large-for-fs'); e.code = 'file/too-large'; throw e; }
    id = id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6));

    var dataUrl = await _readAsDataURL(file);
    var comma = dataUrl.indexOf(',');
    var head = dataUrl.slice(0, comma);                 // "data:<mime>;base64"
    var b64 = dataUrl.slice(comma + 1);
    var mime = (head.slice(5).split(';')[0]) || file.type || 'application/octet-stream';

    var N = Math.max(1, Math.ceil(b64.length / CHUNK));
    var ref = _attRef(id);
    var partsCol = ref.collection('parts');

    // כותבים את ה-parts **במקביל** (concurrency-capped) — חופף round-trips כדי
    // שההעלאה תסתיים ב-~ceil(N/CONCURRENCY) גלים ולא ב-N כתיבות סדרתיות. כתיבה
    // בודדת נכשלת → Promise.all דוחה → זורקים → נפילה מקומית. המטא נכתב **אחרון**
    // (אחרי שכל ה-parts אושרו) — כך שקיום המטא מבטיח שכל ה-parts כבר בענן.
    var next = 0, done = 0;
    function lane() {
      if (next >= N) return Promise.resolve();
      var i = next++;
      return partsCol.doc(String(i)).set({ b: b64.slice(i * CHUNK, (i + 1) * CHUNK) })
        .then(function () {
          done++;
          if (onProgress) { try { onProgress(done / (N + 1)); } catch (e) {} }
          return lane();
        });
    }
    var lanes = [];
    for (var k = 0; k < Math.min(CONCURRENCY, N); k++) lanes.push(lane());
    await Promise.all(lanes);

    await ref.set({
      name: file.name, type: file.type || '', size: file.size,
      mime: mime, chunks: N, createdAt: Date.now()
    });
    if (onProgress) { try { onProgress(1); } catch (e) {} }
    return { id: id, name: file.name, type: file.type || '', size: file.size, fs: true };
  }

  // מוריד קובץ מ-Firestore ומחזיר { dataUrl, name, type, size }. זורק אם המטא
  // חסר (העלאה לא הושלמה / נמחק). onProgress(frac) בין part ל-part.
  async function fetchFile(id, onProgress) {
    if (!_db()) throw new Error('firestore-unavailable');
    if (!_user()) throw new Error('not-signed-in');
    var ref = _attRef(id);
    var metaSnap = await ref.get();
    if (!metaSnap.exists) { var e = new Error('attachment-missing'); e.code = 'file/missing'; throw e; }
    var meta = metaSnap.data() || {};
    var N = meta.chunks || 0;
    var partsCol = ref.collection('parts');
    var parts = new Array(N);

    // קריאת ה-parts **במקביל** (concurrency-capped) — אותו רווח-ביצועים כמו בכתיבה.
    var next = 0, done = 0;
    function lane() {
      if (next >= N) return Promise.resolve();
      var i = next++;
      return partsCol.doc(String(i)).get().then(function (ps) {
        parts[i] = (ps.exists && ps.data() && ps.data().b) || '';
        done++;
        if (onProgress) { try { onProgress(done / N); } catch (e) {} }
        return lane();
      });
    }
    var lanes = [];
    for (var k = 0; k < Math.min(CONCURRENCY, N); k++) lanes.push(lane());
    await Promise.all(lanes);

    var mime = meta.mime || meta.type || 'application/octet-stream';
    return { dataUrl: 'data:' + mime + ';base64,' + parts.join(''), name: meta.name || 'file', type: meta.type || '', size: meta.size || 0 };
  }

  // מפענח base64 בודד ל-Uint8Array.
  function _b64ToBytes(b64) {
    var bin = atob(b64 || '');
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // מוריד קובץ ומחזיר { blob, name, type, size } — **הנתיב הנכון לקבצים גדולים.**
  // ההבדל מ-fetch: כאן כל part מפוענח לבייטים בנפרד ואז ה-Blob נבנה ממערך
  // הבייטים, כך שלעולם לא נוצרת מחרוזת base64 של הקובץ כולו. ב-50MB המסלול
  // המחרוזתי מחזיק בו-זמנית ~67MB base64 + ~67MB עותק משורשר + ~50MB מחרוזת
  // בינארית + ~50MB בייטים — מספיק כדי להקפיא או להפיל את הטאב.
  // חוקיות הפענוח-לחתיכות: CHUNK הוא כפולה של 4, ו-base64 מיושר ל-4 בייטים,
  // לכן כל part (פרט אולי לאחרון) הוא base64 תקף בפני עצמו. אם part כלשהו
  // אינו כפולה של 4 (נכתב בגרסה עם CHUNK אחר) — נופלים לשרשור המלא, שנכון תמיד.
  async function fetchBlob(id, onProgress) {
    if (!_db()) throw new Error('firestore-unavailable');
    if (!_user()) throw new Error('not-signed-in');
    var ref = _attRef(id);
    var metaSnap = await ref.get();
    if (!metaSnap.exists) { var e = new Error('attachment-missing'); e.code = 'file/missing'; throw e; }
    var meta = metaSnap.data() || {};
    var N = meta.chunks || 0;
    var partsCol = ref.collection('parts');
    var parts = new Array(N);

    var next = 0, done = 0;
    function lane() {
      if (next >= N) return Promise.resolve();
      var i = next++;
      return partsCol.doc(String(i)).get().then(function (ps) {
        parts[i] = (ps.exists && ps.data() && ps.data().b) || '';
        done++;
        if (onProgress) { try { onProgress(done / N); } catch (e) {} }
        return lane();
      });
    }
    var lanes = [];
    for (var k = 0; k < Math.min(CONCURRENCY, N); k++) lanes.push(lane());
    await Promise.all(lanes);

    var aligned = true;
    for (var j = 0; j < N - 1; j++) { if (parts[j].length % 4 !== 0) { aligned = false; break; } }
    var mime = meta.mime || meta.type || 'application/octet-stream';
    var blob;
    if (aligned) {
      // דריסה במקום — משחררת כל מחרוזת base64 מיד עם פענוחה במקום להחזיק את שתי
      // הצורות של הקובץ כולו בו-זמנית.
      for (var m = 0; m < N; m++) parts[m] = _b64ToBytes(parts[m]);
      blob = new Blob(parts, { type: mime });
    } else {
      blob = new Blob([_b64ToBytes(parts.join(''))], { type: mime });
    }
    return { blob: blob, name: meta.name || 'file', type: meta.type || '', size: meta.size || 0 };
  }

  // מחיקה (בעת הסרת קובץ מהנושא). best-effort — לא זורק.
  // מוחק מטא + כל ה-parts ב-batch אטומי אחד (round-trip יחיד; מתפצל אם > מגבלת
  // ה-batch). המטא נכלל ב-batch הראשון → אם מחיקה מתפצלת ונקטעת, המטא כבר נמחק
  // וה-fetch יראה "חסר" (מחוק לוגית; parts יתומים = זבל לא-מזיק).
  async function remove(id) {
    var db = _db();
    if (!db || !_user() || !id) return;
    try {
      var ref = _attRef(id);
      var metaSnap = await ref.get();
      var N = (metaSnap.exists && metaSnap.data() && metaSnap.data().chunks) || 0;
      var partsCol = ref.collection('parts');
      var refs = [ref];
      for (var i = 0; i < N; i++) refs.push(partsCol.doc(String(i)));
      for (var s = 0; s < refs.length; s += 450) {
        var batch = db.batch();
        refs.slice(s, s + 450).forEach(function (r) { batch.delete(r); });
        await batch.commit();
      }
    } catch (e) { /* הרשאה / כבר נמחק — best-effort */ }
  }

  window.CloudFiles = { enabled: enabled, fits: fits, upload: upload, fetch: fetchFile, fetchBlob: fetchBlob, remove: remove, FS_MAX: FS_MAX };
})();
