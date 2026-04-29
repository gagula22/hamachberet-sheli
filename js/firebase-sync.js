(function () {
  'use strict';

  let db = null;
  let auth = null;
  let userId = null;
  let knownTopicIds = null;

  const MAIN_KEYS = [
    'notes', 'tasks', 'todos', 'habits', 'mood',
    'water', 'sleep', 'transactions', 'goals', 'slots', 'settings'
  ];

  // ── Initialisation ────────────────────────────────────────────────────────

  function isConfigured() {
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
      db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
      return true;
    } catch (e) {
      console.warn('Firebase init failed:', e);
      return false;
    }
  }

  // Shows a non-blocking banner at the top of the page when Firebase is unavailable
  function showOfflineBanner() {
    if (document.getElementById('fb-offline-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'fb-offline-banner';
    banner.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:9997;' +
      'background:#fff3cd;border-bottom:1px solid #ffc107;' +
      'padding:10px 20px;font-family:Heebo,Arial,sans-serif;direction:rtl;' +
      'font-size:13px;color:#856404;display:flex;align-items:center;gap:10px;';
    banner.innerHTML =
      '⚠️ <strong>הסנכרון בין מכשירים אינו פעיל</strong> — ' +
      'הנתונים נשמרים רק במכשיר זה. ' +
      '<button id="fb-retry-btn" style="margin-right:8px;padding:4px 10px;' +
      'background:#ffc107;border:none;border-radius:6px;cursor:pointer;' +
      'font-family:Heebo,Arial,sans-serif;font-size:12px;font-weight:600">' +
      'התחבר עכשיו</button>' +
      '<button id="fb-dismiss-banner" style="margin-right:auto;background:none;border:none;' +
      'cursor:pointer;font-size:16px;color:#856404">✕</button>';
    document.body.appendChild(banner);
    document.getElementById('fb-dismiss-banner').addEventListener('click', () => banner.remove());
    document.getElementById('fb-retry-btn').addEventListener('click', () => {
      banner.remove();
      window.FirebaseSync.setup();
    });
  }

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
        <h1 style="font-size:26px;font-weight:700;margin-bottom:8px;color:#3b3a3a">
          המחברת שלי
        </h1>
        <p style="color:#888;margin-bottom:36px;font-size:15px;line-height:1.7">
          התחבר עם חשבון Google כדי לגשת למחברת שלך<br>מכל מכשיר ובכל מקום
        </p>
        <button id="fb-google-btn" style="
          width:100%;padding:14px 20px;
          background:#4285f4;color:#fff;
          border:none;border-radius:12px;
          font-size:16px;font-weight:600;cursor:pointer;
          display:flex;align-items:center;justify-content:center;gap:10px;
          transition:opacity 180ms">
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
        // onAuthStateChanged will handle the rest
      } catch (e) {
        // popup-blocked or popup-closed: fall back to full-page redirect
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user') {
          btn.querySelector('span').textContent = 'מפנה לכניסה…';
          try {
            await auth.signInWithRedirect(new firebase.auth.GoogleAuthProvider());
            return; // page will navigate away
          } catch (re) {
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

  // ── Cloud push ────────────────────────────────────────────────────────────

  async function syncTopics(topics) {
    try {
      const col = db.collection(`users/${userId}/topics`);
      const currentIds = new Set(topics.map(t => t.id));

      if (knownTopicIds === null) {
        const snap = await col.get();
        knownTopicIds = new Set();
        snap.forEach(d => knownTopicIds.add(d.id));
      }

      const batch = db.batch();
      topics.forEach(t => batch.set(col.doc(t.id), t));
      for (const id of knownTopicIds) {
        if (!currentIds.has(id)) batch.delete(col.doc(id));
      }
      knownTopicIds = currentIds;
      await batch.commit();
    } catch (e) {
      console.warn('Topics sync failed:', e);
    }
  }

  const pending = {};
  const timers  = {};
  let inflight = 0;

  function setStatus(state) {
    const el = document.getElementById('fb-sync-status');
    if (el) {
      if (state === 'saving') {
        el.textContent = '✏️ שומר…';
        el.style.color = 'var(--ink-mute)';
      } else if (state === 'saved') {
        const t = new Date();
        const hh = String(t.getHours()).padStart(2, '0');
        const mm = String(t.getMinutes()).padStart(2, '0');
        el.textContent = `✓ נשמר • ${hh}:${mm}`;
        el.style.color = '';
      } else if (state === 'error') {
        el.textContent = '⚠️ לא הצליח לסנכרן';
        el.style.color = '#e53e3e';
      }
    }
    // Also update the notebook editor's sync chip if open
    if (window._nbSyncHook) {
      try { window._nbSyncHook(state); } catch {}
    }
  }

  function schedulePush(key, value) {
    pending[key] = value;
    clearTimeout(timers[key]);
    setStatus('saving');
    timers[key] = setTimeout(() => doPush(key), 700);
  }

  async function doPush(key) {
    const value = pending[key];
    if (value === undefined || !db || !userId) return;
    delete pending[key];
    inflight++;
    try {
      if (key === 'topics') {
        await syncTopics(value);
      } else {
        await db.doc(`users/${userId}/data/main`).set({ [key]: value }, { merge: true });
      }
      inflight--;
      if (inflight === 0 && Object.keys(pending).length === 0) setStatus('saved');
    } catch (e) {
      inflight--;
      console.warn(`Push "${key}" failed:`, e);
      setStatus('error');
    }
  }

  function flushAll() {
    const keys = Object.keys(pending);
    const work = Promise.all(keys.map(key => {
      clearTimeout(timers[key]);
      return doPush(key);
    }));
    // Hard 8-second timeout — never leave callers hanging
    const timeout = new Promise(resolve => setTimeout(resolve, 8000));
    return Promise.race([work, timeout]);
  }

  // ── Merge helpers — preserve unsynced local data on initial cloud load ──
  //
  // The first cloud snapshot used to OVERWRITE local IDB data. That meant
  // that if a device had unsynced edits (e.g. tab closed mid-debounce), they
  // were silently destroyed when the device next went online. Now we merge:
  // both local and cloud contribute, and on conflict (same id) the side with
  // the newer updatedAt wins. The merged result is then pushed back to cloud
  // so all devices converge.

  function mergeArrayById(local, cloud) {
    const map = new Map();
    (cloud || []).forEach(item => {
      if (item && item.id != null) map.set(item.id, item);
    });
    (local || []).forEach(item => {
      if (!item || item.id == null) return;
      const c = map.get(item.id);
      if (!c) { map.set(item.id, item); return; }
      const lU = item.updatedAt || item.createdAt || 0;
      const cU = c.updatedAt || c.createdAt || 0;
      if (lU >= cU) map.set(item.id, item);
    });
    return Array.from(map.values());
  }

  function mergeHabits(local, cloud) {
    const map = new Map();
    (cloud || []).forEach(h => { if (h && h.id) map.set(h.id, h); });
    (local || []).forEach(h => {
      if (!h || !h.id) return;
      const c = map.get(h.id);
      if (!c) { map.set(h.id, h); return; }
      // Merge habit logs (per-day) — union both date sets
      map.set(h.id, { ...c, ...h, log: { ...(c.log || {}), ...(h.log || {}) } });
    });
    return Array.from(map.values());
  }

  function mergeSlots(local, cloud) {
    const merged = { ...(cloud || {}) };
    Object.keys(local || {}).forEach(date => {
      merged[date] = merged[date]
        ? { ...merged[date], ...local[date] }
        : local[date];
    });
    return merged;
  }

  function mergeByKey(key, local, cloud) {
    if (local === undefined || local === null) return cloud;
    if (cloud === undefined || cloud === null) return local;
    switch (key) {
      case 'notes':
      case 'transactions':
      case 'goals':
      case 'tasks':
      case 'todos':
        return mergeArrayById(local, cloud);
      case 'habits':
        return mergeHabits(local, cloud);
      case 'mood':
      case 'water':
      case 'sleep':
        // Date-keyed maps — local wins on conflict, cloud fills missing days
        return { ...cloud, ...local };
      case 'slots':
        return mergeSlots(local, cloud);
      case 'settings':
        return { ...cloud, ...local };
      default:
        return local;
    }
  }

  function differs(a, b) {
    try { return JSON.stringify(a) !== JSON.stringify(b); }
    catch { return true; }
  }

  // ── Real-time listeners ───────────────────────────────────────────────────

  function listenToCloud() {
    return new Promise(resolve => {
      let mainReady = false;
      let topicsReady = false;
      let mainFirst = true;
      let topicsFirst = true;

      function checkDone() {
        if (mainReady && topicsReady) resolve();
      }

      // Real-time listener on main document
      db.doc(`users/${userId}/data/main`).onSnapshot(snap => {
        if (mainFirst) {
          mainFirst = false;
          if (snap.exists) {
            // Initial load — MERGE local IDB with cloud (don't overwrite).
            const cloud = snap.data();
            MAIN_KEYS.forEach(k => {
              if (cloud[k] === undefined) return;
              const local = Store.get(k);
              const merged = mergeByKey(k, local, cloud[k]);
              Store._local(k, merged);
              // If local contributed something cloud didn't have, push merged back.
              if (differs(merged, cloud[k])) schedulePush(k, merged);
            });
          } else {
            // First-ever login: push local data up to the cloud
            const batch = {};
            MAIN_KEYS.forEach(k => { batch[k] = Store.get(k); });
            db.doc(`users/${userId}/data/main`).set(batch).catch(() => {});
          }
          mainReady = true;
          checkDone();
        } else if (snap.exists) {
          // Real-time update from another device/tab → trust cloud
          const data = snap.data();
          MAIN_KEYS.forEach(k => { if (data[k] !== undefined) Store._fromCloud(k, data[k]); });
        }
      }, err => {
        console.warn('Main listener error:', err);
        mainReady = true;
        checkDone();
      });

      // Real-time listener on topics collection
      db.collection(`users/${userId}/topics`).onSnapshot(snap => {
        const cloudTopics = [];
        snap.forEach(d => cloudTopics.push(d.data()));

        if (topicsFirst) {
          topicsFirst = false;
          const local = Store.get('topics') || [];
          knownTopicIds = new Set(cloudTopics.map(t => t.id));

          if (cloudTopics.length === 0 && local.length === 0) {
            // both empty — nothing to do
          } else if (cloudTopics.length === 0) {
            // First-ever login: push local topics up
            syncTopics(local).catch(() => {});
          } else {
            // Both have data — merge by id (newer updatedAt wins on conflict)
            const merged = mergeArrayById(local, cloudTopics);
            Store._local('topics', merged);
            // If local had unsynced topics or newer versions, push merged back
            // so all devices converge to the union.
            if (differs(
                merged.slice().sort((a,b) => String(a.id).localeCompare(b.id)),
                cloudTopics.slice().sort((a,b) => String(a.id).localeCompare(b.id))
            )) {
              schedulePush('topics', merged);
            }
          }
          topicsReady = true;
          checkDone();
        } else {
          // Real-time update from another device/tab → trust cloud
          knownTopicIds = new Set(cloudTopics.map(t => t.id));
          Store._fromCloud('topics', cloudTopics);
        }
      }, err => {
        console.warn('Topics listener error:', err);
        topicsReady = true;
        checkDone();
      });
    });
  }

  // ── Topbar sync button ────────────────────────────────────────────────────

  function renderSyncBtn() {
    let btn = document.getElementById('syncNowBtn');
    // Create the button dynamically if HTML is cached and element doesn't exist
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'syncNowBtn';
      btn.className = 'sync-now-btn';
      btn.title = 'סנכרן עכשיו';
      btn.textContent = '☁️';
      const topbarRight = document.querySelector('.topbar-right');
      const search = document.getElementById('globalSearch');
      if (topbarRight && search) {
        topbarRight.insertBefore(btn, search.nextSibling);
      } else if (topbarRight) {
        topbarRight.appendChild(btn);
      } else { return; }
    }
    btn.style.display = 'grid';
    btn.addEventListener('click', async () => {
      if (btn.classList.contains('syncing')) return;
      btn.classList.add('syncing');
      btn.title = 'מסנכרן…';
      try {
        const KEYS = ['notes','tasks','todos','habits','mood','water','sleep',
                      'transactions','goals','slots','settings','topics'];
        KEYS.forEach(k => {
          const v = Store.get(k);
          if (v !== undefined) schedulePush(k, v);
        });
        await Promise.race([flushAll(), new Promise(r => setTimeout(r, 8000))]);
        btn.title = 'סונכרן ✓';
        if (window.App) App.toast('☁️ סנכרון הושלם');
      } catch {
        btn.title = 'שגיאת סנכרון';
        if (window.App) App.toast('⚠️ סנכרון נכשל');
      }
      btn.classList.remove('syncing');
      setTimeout(() => { btn.title = 'סנכרן עכשיו'; }, 3000);
    });
  }

  // ── User bar in sidebar ───────────────────────────────────────────────────

  function renderUserBar(user) {
    const bar = document.getElementById('sidebarUserBar');
    if (!bar) return;
    bar.style.display = 'flex';
    const photo = user.photoURL
      ? `<img src="${user.photoURL}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0">`
      : `<div style="width:32px;height:32px;border-radius:50%;background:var(--lavender);display:grid;place-items:center;font-size:16px;flex-shrink:0">👤</div>`;
    bar.innerHTML = `
      ${photo}
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${user.displayName || user.email || 'משתמש'}
        </div>
        <div id="fb-sync-status" style="font-size:11px;color:var(--ink-mute);cursor:pointer"
             title="לחץ לסנכרן עכשיו">☁️ מסונכרן בזמן אמת</div>
      </div>
      <button id="fb-signout" title="התנתקות"
        style="font-size:20px;cursor:pointer;background:none;border:none;color:var(--ink-mute);padding:4px;line-height:1">⏏</button>`;

    document.getElementById('fb-sync-status').addEventListener('click', async () => {
      setStatus('saving');
      try {
        const KEYS = ['notes','tasks','todos','habits','mood','water','sleep',
                      'transactions','goals','slots','settings','topics'];
        KEYS.forEach(k => {
          const v = Store.get(k);
          if (v !== undefined) schedulePush(k, v);
        });
        await flushAll();
        setStatus('saved');
        if (window.App) App.toast('סנכרון הושלם ✓');
      } catch {
        setStatus('error');
      }
    });

    document.getElementById('fb-signout').addEventListener('click', () => {
      if (confirm('להתנתק מהחשבון?')) auth.signOut().then(() => location.reload());
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  window.FirebaseSync = {
    enabled: false,

    async setup() {
      if (!initSDK()) {
        // Firebase SDK not loaded or not configured — show non-blocking warning
        setTimeout(showOfflineBanner, 1500);
        return false;
      }

      // Handle post-redirect auth (when signInWithRedirect was used)
      try {
        await auth.getRedirectResult();
      } catch { /* no redirect result is fine */ }

      const user = await waitForUser();
      userId = user.uid;
      this.enabled = true;

      const loader = document.createElement('div');
      loader.style.cssText =
        'position:fixed;inset:0;z-index:9998;background:rgba(255,255,255,.9);' +
        'display:grid;place-items:center;font-family:Heebo,Arial,sans-serif;' +
        'direction:rtl;font-size:17px;color:#888;gap:16px';
      loader.innerHTML = '<div style="font-size:40px">☁️</div><div>טוען נתונים מהענן…</div>';
      document.body.appendChild(loader);

      // CRITICAL: wait for local IDB to load BEFORE the cloud listener fires
      // its first snapshot. Otherwise the merge would see empty local state
      // and the cloud would still effectively overwrite unsynced edits.
      if (window.Store && Store.ready) {
        try { await Store.ready(); } catch {}
      }

      // Start real-time listeners; wait for initial snapshot to load
      await listenToCloud();
      loader.remove();

      setTimeout(() => { renderUserBar(user); renderSyncBtn(); }, 600);

      // Flush pending pushes when the page is about to be hidden/closed
      // — without this, the debounce timer dies with the page and the last
      // edits never reach Firestore.
      window.addEventListener('pagehide', flushAll);
      window.addEventListener('beforeunload', flushAll);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushAll();
      });

      // Periodic forced push every 90 seconds — safety net for any missed pushes
      setInterval(() => {
        if (!userId || !db) return;
        const MAIN_KEYS_SYNC = [
          'notes', 'tasks', 'todos', 'habits', 'mood',
          'water', 'sleep', 'transactions', 'goals', 'slots', 'settings'
        ];
        MAIN_KEYS_SYNC.forEach(k => {
          const v = Store.get(k);
          if (v !== undefined) schedulePush(k, v);
        });
        const topics = Store.get('topics');
        if (topics) schedulePush('topics', topics);
      }, 90000);

      return true;
    },

    push(key, value) {
      if (!this.enabled || !userId) return;
      schedulePush(key, value);
    },

    flush() {
      if (!this.enabled || !userId) return Promise.resolve();
      return flushAll();
    }
  };
})();
