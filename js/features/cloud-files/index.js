(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // קבצי-ענן — אחריות עצמאית (window.CloudFiles). מעלה קבצים מצורפים ל-Firebase
  // Storage (ללא מגבלת ה-1MB של Firestore) ומחזיר קישור-הורדה. הנושא שומר רק
  // את הקישור הקטן — לא את ה-base64 — כך שהקובץ באמת בענן, זמין מכל מכשיר,
  // והנושא מסתנכרן במלואו ל-Firestore.
  //
  // אימות אמיתי: ref.put(file) של Storage נפתר רק אחרי שהקובץ הועלה לשרת
  // (בניגוד ל-Firestore set() עם offline-persistence שנפתר על מטמון מקומי).
  //
  // עצמאי לחלוטין: media.js קורא לכאן דרך window.CloudFiles בלבד. אם Storage לא
  // זמין (לא מחובר / SDK חסר / הרשאות חסומות) — enabled=false, ו-media.js נופל
  // חיננית להטמעת base64 מקומית (ההתנהגות הקודמת) — כלום לא נשבר.
  // ─────────────────────────────────────────────────────────────────────────

  function _fb() {
    return (window.firebase && firebase.apps && firebase.apps.length) ? firebase : null;
  }
  function _user() {
    var fb = _fb();
    try { return fb && fb.auth && fb.auth().currentUser ? fb.auth().currentUser : null; } catch (e) { return null; }
  }

  // האם אפשר להעלות עכשיו: SDK טעון, יש storage, ומשתמש מחובר.
  function enabled() {
    var fb = _fb();
    return !!(fb && fb.storage && _user() && !window.IMPROVED_SITE_SANDBOX);
  }

  function _safeName(name) {
    return String(name || 'file').replace(/[^\w.\-]+/g, '_').slice(0, 80);
  }

  // מעלה קובץ ומחזיר { url, path, name, type, size }. זורק אם ההעלאה נכשלת
  // (רשת/הרשאות/תקיעה) — הקורא אחראי לנפילה חיננית.
  // onProgress(frac, transferred, total) נקרא תוך כדי ההעלאה (0..1) כדי להציג
  // אחוזי-התקדמות — כך שהעלאה איטית נראית מתקדמת ולא "תקועה".
  //
  // ⚠️ watchdog: ברירת המחדל של Storage היא לנסות שוב בשקט עד 10 דקות
  // (maxUploadRetryTime) — כך שהעלאה שנכשלת "נתקעת" על 0%. מקצרים אותה, ומוסיפים
  // שעון-תקיעה: אם אין התקדמות-בייטים במשך CloudFiles.stallMs — מבטלים ודוחים
  // עם code=storage/stalled, כדי שהקורא ייפול מיד למקומי (במקום להמתין 10 דקות).
  async function upload(file, id, onProgress) {
    var fb = _fb();
    if (!fb || !fb.storage) throw new Error('storage-unavailable');
    var user = _user();
    if (!user) throw new Error('not-signed-in');
    var storage = fb.storage();
    try { storage.setMaxUploadRetryTime(20000); storage.setMaxOperationRetryTime(20000); } catch (e) {}
    var path = 'users/' + user.uid + '/attachments/' + (id || Date.now().toString(36)) + '-' + _safeName(file.name);
    var ref = storage.ref(path);
    var task = ref.put(file, { contentType: file.type || 'application/octet-stream' });
    var stallMs = (window.CloudFiles && window.CloudFiles.stallMs) || 30000;
    // ref.put מחזיר UploadTask (resumable) שמשדר התקדמות דרך state_changed.
    await new Promise(function (resolve, reject) {
      var lastBytes = -1, timer;
      function arm() {
        clearTimeout(timer);
        timer = setTimeout(function () {
          try { task.cancel(); } catch (e) {}
          var err = new Error('upload stalled (no bytes moved in ' + stallMs + 'ms)');
          err.code = 'storage/stalled'; reject(err);
        }, stallMs);
      }
      arm();  // מכסה את "תקוע על 0%" — אם אף בייט לא זז, הטיימר הראשוני מפעיל ביטול
      task.on('state_changed',
        function (snap) {
          if (snap.bytesTransferred !== lastBytes) { lastBytes = snap.bytesTransferred; if (snap.bytesTransferred > 0) arm(); }
          if (onProgress && snap.totalBytes) {
            try { onProgress(snap.bytesTransferred / snap.totalBytes, snap.bytesTransferred, snap.totalBytes); } catch (e) {}
          }
        },
        function (err) { clearTimeout(timer); reject(err); },  // כשל רשת/הרשאות → נפילה מקומית
        function () { clearTimeout(timer); resolve(); }         // הושלם
      );
    });
    var url = await task.snapshot.ref.getDownloadURL();
    return { url: url, path: path, name: file.name, type: file.type || '', size: file.size };
  }

  // מחיקה מ-Storage (בעת הסרת קובץ מהנושא). best-effort — לא זורק.
  async function remove(path) {
    var fb = _fb();
    if (!fb || !fb.storage || !path) return;
    try { await fb.storage().refFromURL ? null : null; } catch (e) {}
    try { await fb.storage().ref(path).delete(); } catch (e) { /* כבר נמחק / הרשאה — לא קריטי */ }
  }

  window.CloudFiles = { enabled: enabled, upload: upload, remove: remove, stallMs: 30000 };
})();
