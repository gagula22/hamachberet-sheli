(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // גיבוי-תמלולים לענן — חלק מאחריות הקול (window.VoiceBackup, P-51).
  //
  // מה זה: גיבוי **ידני בלבד** (כפתור ☁️ פר-הקלטה ב-memos.js) של ה-ט-ק-ס-ט —
  // התמלול, התרגום וחותמות-הזמן — ל-Firestore. **האודיו לא מגובה** (כבד מדי;
  // נשאר ב-IndexedDB המקומי בכוונה). החלטת המשתמש (15.7.2026): שום גיבוי
  // אוטומטי — רק לחיצה מפורשת מגבה.
  //
  // מבנה: מסמך יחיד `users/{uid}/voice-transcripts/{memoId}` עם כל הטקסט.
  // תמלול של 3 שעות ≈ 200-300KB — נכנס במסמך אחד (מגבלת Firestore: 1MB).
  // אם המסמך חורג מ-~900KB, חותכים קודם את transcriptChunks (חותמות-הזמן —
  // הרכיב הכבד והוותר ביותר) ומשאירים את הטקסט המלא.
  //
  // ⚠️ מחוץ ל-Store/סכימה **בכוונה** (אותה החלטה כמו attachments של P-12):
  // כתיבה ישירה ל-Firestore, לא דרך מנוע-הסנכרון — אין מפתח store-schema,
  // אין אסרציית firebase-sync. כלל-ההרשאה הרקורסיבי הקיים
  // `match /users/{uid}/{document=**}` כבר מכסה — אין שינוי כללים בקונסול.
  //
  // אימות-שרת: promise של set() ב-Firestore מתקיים רק אחרי אישור ה-backend,
  // כך ש"גובה" שמוצג למשתמש הוא אמת-שרת, לא כתיבה-למטמון בלבד.
  // ─────────────────────────────────────────────────────────────────────────

  var DOC_BUDGET = 900 * 1024;   // תקציב-בייטים בטוח מתחת ל-1MB/מסמך

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
  function enabled() {
    return !!(_db() && _user() && !window.IMPROVED_SITE_SANDBOX);
  }

  function _ref(id) {
    return _db().doc('users/' + _user().uid + '/voice-transcripts/' + id);
  }

  // בונה את מסמך-הגיבוי מהרשומה המקומית. טקסט בלבד — בלי blob.
  function _payload(memo) {
    var doc = {
      id: memo.id,
      name: memo.name || '',
      lang: memo.lang || 'he',
      createdAt: memo.createdAt || Date.now(),
      duration: memo.duration || 0,
      engine: memo.engine || '',
      transcript: memo.transcript || '',
      backedUpAt: Date.now()
    };
    if (memo.translation) doc.translation = memo.translation;
    if (Array.isArray(memo.transcriptChunks) && memo.transcriptChunks.length) {
      doc.transcriptChunks = memo.transcriptChunks;
    }
    // גדול מדי? מוותרים על חותמות-הזמן (ה-Word המגובה יאבד רק אותן, לא טקסט)
    if (JSON.stringify(doc).length > DOC_BUDGET && doc.transcriptChunks) {
      delete doc.transcriptChunks;
      doc.chunksDropped = true;
    }
    if (JSON.stringify(doc).length > DOC_BUDGET) {
      throw new Error('התמלול גדול מדי לגיבוי במסמך ענן יחיד');
    }
    return doc;
  }

  // מגבה תמלול של הקלטה אחת. מחזיר backedUpAt (ms) אחרי אישור-שרת אמיתי.
  async function backup(memo) {
    if (!memo || !memo.transcript) throw new Error('אין תמלול לגבות — תמלל קודם (📝)');
    if (!enabled()) throw new Error('לא מחובר לענן — התחבר קודם (איזור המשתמש בסרגל)');
    var doc = _payload(memo);
    await _ref(memo.id).set(doc);   // resolves only on backend commit
    return doc.backedUpAt;
  }

  // רשימת הגיבויים הקיימים בענן (מטא בלבד — לשימוש עתידי של מסך-שחזור).
  async function list() {
    if (!enabled()) throw new Error('לא מחובר לענן');
    var snap = await _db().collection('users/' + _user().uid + '/voice-transcripts').get();
    var out = [];
    snap.forEach(function (d) {
      var v = d.data() || {};
      out.push({ id: d.id, name: v.name, lang: v.lang, createdAt: v.createdAt, duration: v.duration, backedUpAt: v.backedUpAt });
    });
    return out.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  }

  // שליפת גיבוי מלא (לשחזור עתידי / בדיקות).
  async function fetchOne(id) {
    if (!enabled()) throw new Error('לא מחובר לענן');
    var d = await _ref(id).get();
    return d.exists ? d.data() : null;
  }

  window.VoiceBackup = { enabled: enabled, backup: backup, list: list, fetchOne: fetchOne };
})();
