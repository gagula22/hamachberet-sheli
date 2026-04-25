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
    if (location.protocol === 'file:') return false; // Firebase needs http/https
    return true;
  }

  function initSDK() {
    if (!isConfigured() || !window.firebase) return false;
    try {
      if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
      db   = firebase.firestore();
      auth = firebase.auth();
      // Enable offline persistence so the app works if connection drops
      db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
      return true;
    } catch (e) {
      console.warn('Firebase init failed:', e);
      return false;
    }
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
      } catch (e) {
        const err = document.getElementById('fb-login-err');
        if (err) err.textContent = 'שגיאה: ' + (e.message || e.code || 'נסה שוב');
        btn.disabled = false; btn.style.opacity = '1';
        btn.querySelector('span').textContent = 'כניסה עם Google';
      }
    });

    // onAuthStateChanged will call resolve once login succeeds
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

  // ── Cloud pull ────────────────────────────────────────────────────────────

  async function pullFromCloud() {
    try {
      // Pull main data (notes, habits, mood, etc.)
      const mainSnap = await db.doc(`users/${userId}/data/main`).get();
      let cloudHasMainData = mainSnap.exists;

      if (cloudHasMainData) {
        const data = mainSnap.data();
        MAIN_KEYS.forEach(key => {
          if (data[key] !== undefined) Store._local(key, data[key]);
        });
      }

      // Pull topics (stored individually)
      const topicsSnap = await db.collection(`users/${userId}/topics`).get();
      const cloudTopics = [];
      topicsSnap.forEach(doc => cloudTopics.push(doc.data()));

      if (cloudTopics.length > 0) {
        knownTopicIds = new Set(cloudTopics.map(t => t.id));
        Store._local('topics', cloudTopics);
      }

      // First-time setup: push local data up to the cloud
      if (!cloudHasMainData) {
        const batch = {};
        MAIN_KEYS.forEach(key => { batch[key] = Store.get(key); });
        await db.doc(`users/${userId}/data/main`).set(batch);
      }
      if (cloudTopics.length === 0) {
        const localTopics = Store.get('topics') || [];
        if (localTopics.length) await syncTopics(localTopics);
      }
    } catch (e) {
      console.warn('Cloud pull failed:', e);
    }
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

      // Firestore batch: upsert current + delete removed (max 500 ops, fine for personal use)
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

  function schedulePush(key, value) {
    pending[key] = value;
    clearTimeout(timers[key]);
    timers[key] = setTimeout(() => doPush(key), 1500);
  }

  async function doPush(key) {
    const value = pending[key];
    if (value === undefined || !db || !userId) return;
    try {
      if (key === 'topics') {
        await syncTopics(value);
      } else {
        await db.doc(`users/${userId}/data/main`).set({ [key]: value }, { merge: true });
      }
    } catch (e) {
      console.warn(`Push "${key}" failed:`, e);
    }
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
        <div style="font-size:11px;color:var(--ink-mute)">☁️ מסונכרן לענן</div>
      </div>
      <button id="fb-signout" title="התנתקות"
        style="font-size:20px;cursor:pointer;background:none;border:none;color:var(--ink-mute);padding:4px;line-height:1">⏏</button>`;

    document.getElementById('fb-signout').addEventListener('click', () => {
      if (confirm('להתנתק מהחשבון?')) auth.signOut().then(() => location.reload());
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  window.FirebaseSync = {
    enabled: false,

    async setup() {
      if (!initSDK()) return false;

      const user = await waitForUser();
      userId = user.uid;
      this.enabled = true;

      // Show loading screen while pulling cloud data
      const loader = document.createElement('div');
      loader.style.cssText =
        'position:fixed;inset:0;z-index:9998;background:rgba(255,255,255,.9);' +
        'display:grid;place-items:center;font-family:Heebo,Arial,sans-serif;' +
        'direction:rtl;font-size:17px;color:#888;gap:16px';
      loader.innerHTML = '<div style="font-size:40px">☁️</div><div>טוען נתונים מהענן…</div>';
      document.body.appendChild(loader);

      await pullFromCloud();
      loader.remove();

      // Render user info in sidebar (after app mounts)
      setTimeout(() => renderUserBar(user), 600);
      return true;
    },

    push(key, value) {
      if (!this.enabled || !userId) return;
      schedulePush(key, value);
    }
  };
})();
