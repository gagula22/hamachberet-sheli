(function () {
  'use strict';

  let db = null;
  let auth = null;
  let userId = null;

  // ── Data model split ──────────────────────────────────────────────────────
  // SUBCOL_KEYS  → each item is its own Firestore document in a subcollection
  //               (only changed/added/deleted items are written — true diffs)
  // MAIN_DOC_KEYS→ small non-array data stays in one merged document
  // 'topics'     → already individual docs under users/${uid}/topics/
  // Derived from store-schema.js (single source of truth), guarded by a hard
  // assertion: if the classification ever drifts from the known-correct sets,
  // data would sync to the WRONG Firestore location — so throw loudly here
  // instead of risking silent data loss.
  const _SS = window.StoreSchema || {};
  const SUBCOL_KEYS    = Object.keys(_SS).filter(k => _SS[k].sync === 'subcol');
  const MAIN_DOC_KEYS  = Object.keys(_SS).filter(k => _SS[k].sync === 'maindoc');
  (function assertKeyClassification() {
    const sub  = ['notes', 'tasks', 'todos', 'goals', 'transactions', 'customTemplates', 'readingList', 'flashcards', 'trips', 'prompts'];
    const main = ['mood', 'water', 'sleep', 'slots', 'settings', 'habits', 'eisenhower', 'weeklyReviews'];
    const same = (a, b) => a.length === b.length && a.every(x => b.indexOf(x) > -1);
    if (!same(SUBCOL_KEYS, sub) || !same(MAIN_DOC_KEYS, main)) {
      throw new Error('[firebase-sync] StoreSchema key classification mismatch — aborting to protect data.');
    }
  })();

  // lastPushed: the exact value last successfully written to Firestore per key.
  // Used to diff before every write so unchanged data is never re-sent.
  const lastPushed = {};

  // ── Initialisation ────────────────────────────────────────────────────────

  function isConfigured() {
    // "אתר משופר" sandbox: a local copy served over HTTP would otherwise sync to
    // the SAME live Firestore project. When this flag is set we run 100% locally
    // (IndexedDB/localStorage only) so testing the copy never touches live data.
    if (window.IMPROVED_SITE_SANDBOX) return false;
    if (!window.FIREBASE_CONFIG || !window.FIREBASE_CONFIG.apiKey) return false;
    if (location.protocol === 'file:') return false;
    return true;
  }

  function initSDK() {
    if (!isConfigured() || !window.firebase) return false;
    try {
      if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
      db   = firebase.firestore();
      auth = firebase.auth();
      // Brave / ad-blockers / some proxies break Firestore's default streaming
      // (WebChannel) transport, so writes silently stay in the local cache —
      // shown as "synced" but never reaching the server (the "lock" on that
      // device). Auto-detect that and fall back to HTTP long-polling, which
      // gets through such blockers. Must be set before any read/write.
      // תחבורה אדפטיבית: ברירת המחדל היא זיהוי-אוטומטי של long-polling
      // (עובד מצוין ברשתות רגילות). ⚠️ ניסיון לכפות long-polling גלובלית
      // (commit 031d32c) תקע את האתר ב"טוען נתונים מהענן" בדפדפנים מסוימים —
      // לכן הכפייה נדלקת רק פר-מכשיר, דרך דגל mahberet.forceLP שמופעל
      // אוטומטית כש-verifyCloud מאתר רשת חוסמת (מחשב העבודה). שני הדגלים
      // סותרים — לעולם לא להגדיר את שניהם יחד.
      try {
        var forceLP = false;
        try { forceLP = localStorage.getItem('mahberet.forceLP') === '1'; } catch (e) {}
        db.settings(forceLP
          ? { experimentalForceLongPolling: true, merge: true }
          : { experimentalAutoDetectLongPolling: true, merge: true });
      } catch (e) {}
      db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
      return true;
    } catch (e) {
      console.warn('Firebase init failed:', e);
      return false;
    }
  }

  // showOfflineBanner + setStatus live in firebase-ui.js (window.FirebaseUI).

  // ── Login UI ──────────────────────────────────────────────────────────────

  function showLoginUI(resolve) {
    const ov = document.createElement('div');
    ov.id = 'fb-login-overlay';
    ov.style.cssText =
      'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;' +
      'background:linear-gradient(135deg,#FFF7F3 0%,#F6EDFF 100%);' +
      'font-family:Heebo,Arial,sans-serif;direction:rtl';
    ov.innerHTML = `
      <div style="background:#fff;padding:48px 40px;border-radius:24px;
                  box-shadow:0 24px 64px rgba(0,0,0,.14);text-align:center;
                  width:min(400px,92vw)">
        <div style="font-size:56px;margin-bottom:16px">📓</div>
        <h1 style="font-size:26px;font-weight:700;margin-bottom:8px;color:#3b3a3a">המחברת שלי</h1>
        <p style="color:#888;margin-bottom:36px;font-size:15px;line-height:1.7">
          התחבר עם חשבון Google כדי לגשת למחברת שלך<br>מכל מכשיר ובכל מקום
        </p>
        <button id="fb-google-btn" style="
          width:100%;padding:14px 20px;background:#4285f4;color:#fff;
          border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;
          display:flex;align-items:center;justify-content:center;gap:10px;transition:opacity 180ms">
          <svg width="20" height="20" viewBox="0 0 48 48" style="flex-shrink:0">
            <path fill="#ffc107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.8 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
            <path fill="#ff3d00" d="M6.3 14.7 13 19.6C14.8 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.8 29.3 4 24 4 16.3 4 9.7 8.5 6.3 14.7z"/>
            <path fill="#4caf50" d="M24 44c5.2 0 9.9-1.9 13.5-5.1L31.8 33c-2.1 1.5-4.7 2.5-7.8 2.5-5.2 0-9.6-3.3-11.3-8l-6.6 5.1C9.5 39.4 16.3 44 24 44z"/>
            <path fill="#1565c0" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.8l6.2 5c-.4.4 6.7-4.9 6.7-14.8 0-1.3-.1-2.6-.4-3.9z"/>
          </svg>
          <span>כניסה עם Google</span>
        </button>
        <div id="fb-login-err" style="color:#e53e3e;margin-top:12px;font-size:14px"></div>
      </div>`;
    document.body.appendChild(ov);

    document.getElementById('fb-google-btn').addEventListener('click', async () => {
      const btn = document.getElementById('fb-google-btn');
      btn.disabled = true; btn.style.opacity = '.65';
      btn.querySelector('span').textContent = 'מתחבר…';
      try {
        await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
      } catch (e) {
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user') {
          btn.querySelector('span').textContent = 'מפנה לכניסה…';
          try { await auth.signInWithRedirect(new firebase.auth.GoogleAuthProvider()); return; }
          catch (re) {
            const err = document.getElementById('fb-login-err');
            if (err) err.textContent = 'שגיאה: ' + (re.message || re.code || 'נסה שוב');
          }
        } else {
          const err = document.getElementById('fb-login-err');
          if (err) err.textContent = 'שגיאה: ' + (e.message || e.code || 'נסה שוב');
        }
        btn.disabled = false; btn.style.opacity = '1';
        btn.querySelector('span').textContent = 'כניסה עם Google';
      }
    });

    const unsub = auth.onAuthStateChanged(user => {
      if (user) { unsub(); ov.remove(); resolve(user); }
    });
  }

  function waitForUser() {
    return new Promise(resolve => {
      const unsub = auth.onAuthStateChanged(user => {
        if (user) { unsub(); resolve(user); }
        else showLoginUI(resolve);
      });
    });
  }


  // ── Document size safety ──────────────────────────────────────────────────
  // Firestore hard limit: 1 048 576 bytes per document.
  // Base64 images embedded in topic.body can easily exceed this.
  // Strategy: if a topic doc > 900 KB, strip base64 image data before syncing
  // (images are already stored safely in local IndexedDB — no data loss).

  const MAX_DOC_BYTES = 900 * 1024; // 900 KB safety margin

  function _docBytes(obj) {
    try { return new TextEncoder().encode(JSON.stringify(obj)).length; } catch { return 0; }
  }

  // Replace base64 image src values with a tiny transparent 1×1 GIF placeholder.
  // The full image data stays in IndexedDB — only the cloud copy is slimmed down.
  function _stripBase64Images(html) {
    return (html || '').replace(
      /src="data:image\/[^"]{20,}"/g,
      'src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"'
    );
  }

  function _sizeSafeTopic(topic) {
    if (_docBytes(topic) <= MAX_DOC_BYTES) return topic;
    // Strip images from body — keeps text + metadata intact
    const slim = { ...topic, body: _stripBase64Images(topic.body || ''), _imgStripped: true };
    if (window.App) App.toast('⚠️ הנושא מכיל תמונות גדולות — הטקסט יסונכרן, התמונות נשמרות מקומית');
    if (_docBytes(slim) <= MAX_DOC_BYTES) return slim;
    // Extreme case: even text is too long — truncate
    return { ...slim, body: slim.body.slice(0, 60000) };
  }

  // ── Diff-based write functions ────────────────────────────────────────────

  // Write only changed/added/deleted items in a subcollection
  async function syncSubcol(key, newItems) {
    const items = newItems || [];
    const col   = db.collection(`users/${userId}/${key}`);
    const prev  = lastPushed[key];
    const newMap = new Map(items.filter(i => i.id != null).map(i => [String(i.id), i]));
    const batch  = db.batch();
    let   writes = 0;

    if (prev !== undefined) {
      // Diff against last pushed state
      const prevMap = new Map(prev.map(i => [String(i.id), JSON.stringify(i)]));
      for (const [id, item] of newMap) {
        if (prevMap.get(id) !== JSON.stringify(item)) { batch.set(col.doc(id), item); writes++; }
      }
      for (const id of prevMap.keys()) {
        if (!newMap.has(id)) { batch.delete(col.doc(id)); writes++; }
      }
    } else {
      // First push ever — write everything
      for (const [id, item] of newMap) { batch.set(col.doc(id), item); writes++; }
    }

    if (writes > 0) await batch.commit();
    lastPushed[key] = [...items];
    return writes;
  }

  // Write only changed/added/deleted topics
  async function syncTopics(topics) {
    const col    = db.collection(`users/${userId}/topics`);
    const prev   = lastPushed['topics'];
    const newMap = new Map(topics.map(t => [String(t.id), t]));

    // Build the change list.
    const toSet = [];      // [id, topic]
    const toDelete = [];   // id
    if (prev !== undefined) {
      const prevMap = new Map(prev.map(t => [String(t.id), JSON.stringify(t)]));
      for (const [id, topic] of newMap) {
        if (prevMap.get(id) !== JSON.stringify(topic)) toSet.push([id, topic]);
      }
      for (const id of prevMap.keys()) { if (!newMap.has(id)) toDelete.push(id); }
    } else {
      // First push - fetch cloud to detect deletes
      const snap = await col.get();
      const cloudIds = new Set(); snap.forEach(d => cloudIds.add(d.id));
      for (const [id, topic] of newMap) toSet.push([id, topic]);
      for (const id of cloudIds) { if (!newMap.has(id)) toDelete.push(id); }
    }

    // Commit each topic INDIVIDUALLY. The old code used ONE atomic db.batch():
    // if a single topic failed (oversized / large combined payload), the WHOLE
    // batch was rejected and NO topic synced - which left newer notebooks
    // missing on other devices. Per-doc writes are self-healing.
    const failed = new Set();
    for (const [id, topic] of toSet) {
      try { await col.doc(id).set(_sizeSafeTopic(topic)); }
      catch (e) { failed.add(String(id)); console.warn('topic sync failed:', id, e); }
    }
    for (const id of toDelete) {
      try { await col.doc(id).delete(); }
      catch (e) { console.warn('topic delete failed:', id, e); }
    }

    // Record what synced. Failed topics keep a sentinel so the next cycle
    // retries them, without blocking the ones that succeeded.
    lastPushed['topics'] = topics.map(t =>
      failed.has(String(t.id)) ? { id: t.id, __unsynced: true } : t
    );
    return toSet.length + toDelete.length;
  }

  // Write a single field to data/main, skipping if unchanged
  async function syncMainDocKey(key, value) {
    try {
      if (lastPushed[key] !== undefined && JSON.stringify(value) === JSON.stringify(lastPushed[key])) return 0;
    } catch {}
    await db.doc(`users/${userId}/data/main`).set({ [key]: value }, { merge: true });
    lastPushed[key] = value;
    return 1;
  }

  // ── Push scheduling ───────────────────────────────────────────────────────

  const pending = {};
  const timers  = {};
  let inflight  = 0;

  function schedulePush(key, value) {
    pending[key] = value;
    clearTimeout(timers[key]);
    timers[key] = setTimeout(() => doPush(key), 700);
  }

  async function doPush(key) {
    const value = pending[key];
    if (value === undefined || !db || !userId) return;
    delete pending[key];
    inflight++;
    window.FirebaseUI.setStatus('saving');
    try {
      let writePromise;
      if      (key === 'topics')            writePromise = syncTopics(value);
      else if (SUBCOL_KEYS.includes(key))   writePromise = syncSubcol(key, value);
      else                                  writePromise = syncMainDocKey(key, value);

      // Timeout: 30s for topics (may contain images), 10s for everything else
      const timeoutMs = key === 'topics' ? 30000 : 10000;
      await Promise.race([writePromise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))]);
      inflight--;
      if (inflight === 0 && Object.keys(pending).length === 0) window.FirebaseUI.setStatus('saved');
    } catch (e) {
      inflight--;
      console.warn(`Push "${key}" failed:`, e.message || e);
      if (inflight === 0) window.FirebaseUI.setStatus('error');
    }
  }

  function flushAll() {
    const keys = Object.keys(pending);
    const work = Promise.all(keys.map(key => { clearTimeout(timers[key]); return doPush(key); }));
    return Promise.race([work, new Promise(r => setTimeout(r, 8000))]);
  }

  // ── Merge helpers ─────────────────────────────────────────────────────────

  function mergeArrayById(local, cloud) {
    const map = new Map();
    (Array.isArray(cloud) ? cloud : []).forEach(item => { if (item && item.id != null) map.set(item.id, item); });
    (Array.isArray(local) ? local : []).forEach(item => {
      if (!item || item.id == null) return;
      const c = map.get(item.id);
      if (!c) { map.set(item.id, item); return; }
      const lU = item.updatedAt || item.createdAt || 0;
      const cU = c.updatedAt   || c.createdAt   || 0;
      if (lU >= cU) map.set(item.id, item);
    });
    return Array.from(map.values());
  }

  // ── Image-loss guard ───────────────────────────────────────────────────────
  // A topic synced to the cloud may have had its large base64 images stripped to
  // a 1×1 transparent-GIF placeholder (see _sizeSafeTopic — Firestore's 1MB doc
  // limit forces this). That stripped copy must NEVER overwrite a local copy that
  // still holds the real image — otherwise, on the next snapshot/refresh, the
  // image silently becomes a white frame (the placeholder). These helpers detect
  // a stripped cloud topic and keep the local full-image copy instead.
  const _PLACEHOLDER_GIF_KEY = 'R0lGODlhAQABAIAAAAAAAP'; // start of the 1×1 GIF base64

  function _isStrippedTopic(t) {
    return !!(t && (t._imgStripped === true ||
      (typeof t.body === 'string' && t.body.indexOf(_PLACEHOLDER_GIF_KEY) > -1)));
  }

  function _hasRealImage(t) {
    if (!t || typeof t.body !== 'string') return false;
    const m = t.body.match(/src="data:image\/[^"]{20,}"/g);
    return !!m && m.some(s => s.indexOf(_PLACEHOLDER_GIF_KEY) === -1);
  }

  // Given the incoming cloud topics, return a list where any topic whose cloud
  // copy is stripped but whose local copy still has the real image is replaced
  // by the local copy. Deletions and non-image edits still flow through.
  function preserveLocalImages(localTopics, cloudTopics) {
    const localById = new Map();
    (localTopics || []).forEach(t => { if (t && t.id != null) localById.set(String(t.id), t); });
    return (cloudTopics || []).map(ct => {
      if (!_isStrippedTopic(ct)) return ct;
      const lt = localById.get(String(ct && ct.id));
      return (lt && _hasRealImage(lt)) ? lt : ct;
    });
  }

  function mergeByKey(key, local, cloud) {
    if (local === undefined || local === null) return cloud;
    if (cloud === undefined || cloud === null) return local;
    switch (key) {
      case 'habits': {
        const map = new Map();
        (cloud || []).forEach(h => { if (h && h.id) map.set(h.id, h); });
        (local || []).forEach(h => {
          if (!h || !h.id) return;
          const c = map.get(h.id);
          if (!c) { map.set(h.id, h); return; }
          map.set(h.id, { ...c, ...h, log: { ...(c.log || {}), ...(h.log || {}) } });
        });
        return Array.from(map.values());
      }
      case 'slots': {
        const merged = { ...(cloud || {}) };
        Object.keys(local || {}).forEach(d => {
          merged[d] = merged[d] ? { ...merged[d], ...local[d] } : local[d];
        });
        return merged;
      }
      case 'mood': case 'water': case 'sleep':
        return { ...cloud, ...local };
      case 'settings':
        return { ...cloud, ...local };
      default:
        // Arrays -> merge by id. Objects (e.g. newer maindoc keys) -> shallow
        // merge with local winning. Otherwise prefer local. Guards against the
        // crash where a non-array value reached the array merger and killed the
        // whole sync listener.
        if (Array.isArray(local) || Array.isArray(cloud)) return mergeArrayById(local, cloud);
        if (local && cloud && typeof local === 'object' && typeof cloud === 'object')
          return { ...cloud, ...local };
        return (local !== undefined && local !== null) ? local : cloud;
    }
  }

  function differs(a, b) {
    try { return JSON.stringify(a) !== JSON.stringify(b); } catch { return true; }
  }

  // ── Initial cloud load & real-time listeners ──────────────────────────────

  function listenToCloud() {
    return new Promise(resolve => {
      // Wait for: data/main + topics + each SUBCOL_KEY = 2 + SUBCOL_KEYS.length
      const TOTAL = 2 + SUBCOL_KEYS.length;
      let doneCount = 0;
      function checkDone() { if (++doneCount >= TOTAL) resolve(); }

      // ── 1. data/main  (MAIN_DOC_KEYS + migration detection) ──
      let mainFirst = true;
      db.doc(`users/${userId}/data/main`).onSnapshot(snap => {
        if (mainFirst) {
          mainFirst = false;
          if (snap.exists) {
            const cloud = snap.data();
            MAIN_DOC_KEYS.forEach(k => {
              try {
                if (cloud[k] === undefined) return;
                const merged = mergeByKey(k, Store.get(k), cloud[k]);
                Store._local(k, merged);
                if (differs(merged, cloud[k])) schedulePush(k, merged);
                else lastPushed[k] = cloud[k];
              } catch (e) { console.warn('main-doc merge failed for', k, e); }
            });
            // Legacy: if main doc still has SUBCOL arrays, merge them into
            // local store now — subcol listeners will handle cloud migration.
            SUBCOL_KEYS.forEach(k => {
              if (Array.isArray(cloud[k]) && cloud[k].length > 0) {
                const merged = mergeArrayById(Store.get(k), cloud[k]);
                Store._local(k, merged);
              }
            });
          } else {
            // Brand-new account: upload small data to main doc
            const init = {};
            MAIN_DOC_KEYS.forEach(k => { init[k] = Store.get(k); });
            db.doc(`users/${userId}/data/main`).set(init).catch(() => {});
          }
          checkDone();
        } else if (snap.exists) {
          // Real-time update from another device
          const data = snap.data();
          MAIN_DOC_KEYS.forEach(k => { if (data[k] !== undefined) Store._fromCloud(k, data[k]); });
        }
      }, () => { if (mainFirst) { mainFirst = false; checkDone(); } });

      // ── 2. topics subcollection ──
      let topicsFirst = true;
      db.collection(`users/${userId}/topics`).onSnapshot(snap => {
        const cloud = [];
        snap.forEach(d => cloud.push(d.data()));
        if (topicsFirst) {
          topicsFirst = false;
          const local = Store.get('topics') || [];
          if (cloud.length === 0 && local.length > 0) {
            // First upload
            syncTopics(local).catch(() => {});
          } else if (cloud.length > 0) {
            // Restore real images for any topic the cloud has only as a stripped
            // copy — prevents the white-frame-after-refresh image loss.
            const merged = preserveLocalImages(local, mergeArrayById(local, cloud));
            Store._local('topics', merged);
            lastPushed['topics'] = [...cloud];
            if (differs(
              merged.slice().sort((a,b) => String(a.id).localeCompare(b.id)),
              cloud.slice().sort((a,b)  => String(a.id).localeCompare(b.id))
            )) schedulePush('topics', merged);
          }
          checkDone();
        } else {
          // Keep local full-image topics from being clobbered by stripped cloud copies.
          Store._fromCloud('topics', preserveLocalImages(Store.get('topics') || [], cloud));
        }
      }, () => { if (topicsFirst) { topicsFirst = false; checkDone(); } });

      // ── 3. Per-key subcollection listeners ──
      SUBCOL_KEYS.forEach(key => {
        let first = true;
        db.collection(`users/${userId}/${key}`).onSnapshot(snap => {
          const cloud = [];
          snap.forEach(d => cloud.push(d.data()));
          if (first) {
            first = false;
            const local = Store.get(key) || []; // may already contain migrated main-doc data
            if (cloud.length === 0 && local.length > 0) {
              // Migrate: push local (which may include legacy main-doc data) to subcollection
              syncSubcol(key, local).then(() => {
                // Clean up legacy array in data/main
                db.doc(`users/${userId}/data/main`).update({
                  [key]: firebase.firestore.FieldValue.delete()
                }).catch(() => {});
              }).catch(() => {});
            } else if (cloud.length > 0) {
              const merged = mergeArrayById(local, cloud);
              Store._local(key, merged);
              lastPushed[key] = [...cloud];
              if (differs(merged, cloud)) schedulePush(key, merged);
              // Clean up legacy array in data/main (best-effort)
              db.doc(`users/${userId}/data/main`).get().then(doc => {
                if (doc.exists && Array.isArray(doc.data()[key]) && doc.data()[key].length > 0) {
                  db.doc(`users/${userId}/data/main`).update({
                    [key]: firebase.firestore.FieldValue.delete()
                  }).catch(() => {});
                }
              }).catch(() => {});
            }
            checkDone();
          } else {
            Store._fromCloud(key, cloud);
          }
        }, () => { if (first) { first = false; checkDone(); } });
      });
    });
  }

  // renderSyncBtn + renderUserBar live in firebase-ui.js (window.FirebaseUI).
  // ── Public API ────────────────────────────────────────────────────────────

  window.FirebaseSync = {
    enabled: false,

    async setup() {
      // "אתר משופר" sandbox: stay fully local — no banner, no login prompt.
      if (window.IMPROVED_SITE_SANDBOX) return false;
      if (!initSDK()) { setTimeout(window.FirebaseUI.showOfflineBanner, 1500); return false; }

      try { await auth.getRedirectResult(); } catch {}

      const user = await waitForUser();
      userId = user.uid;
      this.enabled = true;

      // טעינה לא-חוסמת: האתר כבר מוצג מהנתונים המקומיים (IndexedDB) —
      // אין שום סיבה לחסום אותו במסך "טוען מהענן". מפעילים את המאזינים
      // ברקע; כשנתוני הענן מגיעים הם מתמזגים אוטומטית (Store._fromCloud →
      // רינדור מחדש). הרענון מיידי, והענן מתעדכן תוך כדי.
      if (window.Store && Store.ready) { try { await Store.ready(); } catch {} }

      // אינדיקטור קטן ולא-חוסם בפינה (נעלם כשהענן מתחבר או אחרי 8ש).
      var chip = document.createElement('div');
      chip.style.cssText =
        'position:fixed;bottom:16px;inset-inline-start:16px;z-index:9996;' +
        'background:rgba(255,255,255,.95);border:1px solid #eee;border-radius:999px;' +
        'padding:6px 14px;font-family:Heebo,Arial,sans-serif;direction:rtl;' +
        'font-size:12px;color:#999;box-shadow:0 2px 10px rgba(0,0,0,.08)';
      chip.textContent = '☁️ מתחבר לענן…';
      document.body.appendChild(chip);
      var chipTimer = setTimeout(function () { if (chip.parentNode) chip.remove(); }, 8000);

      // ריפוי-עצמי ברקע: אם הענן לא ענה תוך 8ש בעוד forceLP דולק — הדגל
      // כנראה האשם (תחבורה כפויה ששוברת את הדפדפן); מכבים, הרענון הבא רגיל.
      listenToCloud().then(function () {
        clearTimeout(chipTimer);
        if (chip.parentNode) chip.remove();
        // הסְנאפשוטים הראשונים של כל אוסף נכנסו ל-Store דרך _local (בלי emit),
        // כדי לא להבהב לפני הרינדור הראשוני. עכשיו כל נתוני הענן בפנים — מציירים
        // מחדש פעם אחת כדי שמסך שכבר מוצג (כמו המחברת בטלפון) יראה את כל הנתונים
        // הטריים מהענן, ולא יישאר תקוע על המטמון הישן. זה תיקון "הטלפון מציג 23".
        if (window.App && App.onCloudUpdate) App.onCloudUpdate();
      }).catch(function () {});
      setTimeout(function () {
        try {
          if (chip.parentNode && localStorage.getItem('mahberet.forceLP') === '1') {
            localStorage.removeItem('mahberet.forceLP');
            console.warn('[sync] cloud slow under forceLP — flag cleared, next load uses auto transport');
          }
        } catch (e2) {}
      }, 8000);

      window.FirebaseUI.renderUserBar(user);
      window.FirebaseUI.renderSyncBtn();

      // Flush on page hide / close
      window.addEventListener('pagehide', flushAll);
      window.addEventListener('beforeunload', flushAll);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushAll();
      });

      // Safety-net: retry any stuck pending writes every 30s
      setInterval(() => {
        if (userId && db && Object.keys(pending).length > 0) flushAll();
      }, 30000);

      return true;
    },

    push(key, value) {
      if (!this.enabled || !userId) return;
      schedulePush(key, value);
    },

    flush() {
      if (!this.enabled || !userId) return Promise.resolve();
      return flushAll();
    },

    signOut() {
      return auth.signOut();
    },

    // Push every data key and wait for completion (used by the sync UI).
    syncAll() {
      const ALL = [...MAIN_DOC_KEYS, ...SUBCOL_KEYS, 'topics'];
      ALL.forEach(k => { const v = Store.get(k); if (v !== undefined) schedulePush(k, v); });
      return flushAll();
    },

    // אימות אמיתי מול הענן: קריאה שמחויבת להגיע מהשרת (source:'server' —
    // עוקפת את המטמון המקומי). אם הרשת חונקת את התקשורת — זה ייכשל,
    // בניגוד לכתיבות שנבלעות בתור ההתמדה המקומי ונראות כ"נשמרו".
    async verifyCloud(timeoutMs) {
      if (!db || !userId) throw new Error('not-connected');
      const probe = db.doc(`users/${userId}/data/main`).get({ source: 'server' });
      await Promise.race([
        probe,
        new Promise((_, rej) => setTimeout(() => rej(new Error('cloud-unreachable')), timeoutMs || 12000))
      ]);
      return true;
    }
  };
})();
