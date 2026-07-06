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
  // (רשת/הרשאות) — הקורא אחראי לנפילה חיננית.
  async function upload(file, id) {
    var fb = _fb();
    if (!fb || !fb.storage) throw new Error('storage-unavailable');
    var user = _user();
    if (!user) throw new Error('not-signed-in');
    var path = 'users/' + user.uid + '/attachments/' + (id || Date.now().toString(36)) + '-' + _safeName(file.name);
    var ref = fb.storage().ref(path);
    var snap = await ref.put(file, { contentType: file.type || 'application/octet-stream' });
    var url = await snap.ref.getDownloadURL();
    return { url: url, path: path, name: file.name, type: file.type || '', size: file.size };
  }

  // מחיקה מ-Storage (בעת הסרת קובץ מהנושא). best-effort — לא זורק.
  async function remove(path) {
    var fb = _fb();
    if (!fb || !fb.storage || !path) return;
    try { await fb.storage().refFromURL ? null : null; } catch (e) {}
    try { await fb.storage().ref(path).delete(); } catch (e) { /* כבר נמחק / הרשאה — לא קריטי */ }
  }

  window.CloudFiles = { enabled: enabled, upload: upload, remove: remove };
})();
