(function () {
  const KEY = 'notebook.v1';
  // Defaults are derived from the single source of truth in store-schema.js.
  const _SCHEMA = window.StoreSchema || {};
  const DEFAULTS = Object.fromEntries(
    Object.keys(_SCHEMA).map(k => [k, structuredClone(_SCHEMA[k].default)])
  );

  // ── IndexedDB (primary storage — no 5MB limit) ───────────────────────────
  const IDB_NAME = 'notebook-store';
  const IDB_VER  = 1;
  const IDB_OBJ  = 'kv';
  let _idb = null;

  function openIDB() {
    if (_idb) return Promise.resolve(_idb);
    return new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(IDB_NAME, IDB_VER);
        req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_OBJ);
        req.onsuccess = e => { _idb = e.target.result; resolve(_idb); };
        req.onerror   = () => reject(req.error);
      } catch (e) { reject(e); }
    });
  }

  function idbGet(key) {
    return openIDB().then(db => new Promise((res, rej) => {
      const req = db.transaction(IDB_OBJ, 'readonly').objectStore(IDB_OBJ).get(key);
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    }));
  }

  function idbSet(key, value) {
    return openIDB().then(db => new Promise((res, rej) => {
      const req = db.transaction(IDB_OBJ, 'readwrite').objectStore(IDB_OBJ).put(value, key);
      req.onsuccess = () => res();
      req.onerror   = () => rej(req.error);
    }));
  }
  // ─────────────────────────────────────────────────────────────────────────

  let state = loadSync();   // immediate load from localStorage (fast first paint)
  const listeners = new Set();

  // After first paint, load from IndexedDB which may have larger / newer data.
  // Exposed via Store.ready() so FirebaseSync can wait for local data before
  // merging with cloud (avoids overwriting unsynced local edits).
  const idbLoadPromise = idbGet(KEY).then(saved => {
    if (!saved) {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          state = Object.assign(structuredClone(DEFAULTS), parsed);
          idbSet(KEY, state).then(() => {
            try { localStorage.removeItem(KEY); } catch {}
          }).catch(() => {});
          emit();
        }
      } catch {}
      return;
    }
    state = Object.assign(structuredClone(DEFAULTS), saved);
    try { localStorage.removeItem(KEY); } catch {}
    emit();
  }).catch(() => { /* IDB unavailable — localStorage already loaded */ });

  function loadSync() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULTS);
      return Object.assign(structuredClone(DEFAULTS), JSON.parse(raw));
    } catch {
      return structuredClone(DEFAULTS);
    }
  }

  let saveTimer;
  function saveNow() {
    // Primary: IndexedDB — no quota issues
    idbSet(KEY, state).catch(() => {
      // Fallback: localStorage
      try { localStorage.setItem(KEY, JSON.stringify(state)); }
      catch (e) {
        if (window.App) App.toast('שגיאת שמירה — בדוק שיש מקום פנוי בדיסק');
        console.warn('Storage error:', e);
      }
    });
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 250);
  }

  function emit() {
    listeners.forEach(fn => { try { fn(state); } catch {} });
  }

  // Merge a set of topics into another by id (newer updatedAt/createdAt wins).
  // Additive only: topics present in `existing` but absent from `incoming` are
  // never removed — so importing one notebook can never wipe other notebooks.
  function mergeTopicsById(existing, incoming) {
    const map = new Map();
    (existing || []).forEach(t => { if (t && t.id != null) map.set(t.id, t); });
    (incoming || []).forEach(t => {
      if (!t || t.id == null) return;
      const cur = map.get(t.id);
      if (!cur) { map.set(t.id, t); return; }
      const curU = cur.updatedAt || cur.createdAt || 0;
      const inU  = t.updatedAt   || t.createdAt   || 0;
      if (inU >= curU) map.set(t.id, t);
    });
    return Array.from(map.values());
  }

  function downloadJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const Store = {
    get(key) { return key ? state[key] : state; },

    _local(key, value) {
      state[key] = value;
      scheduleSave();
    },

    _fromCloud(key, value) {
      state[key] = value;
      scheduleSave();
      emit();
    },

    set(key, value) {
      state[key] = value;
      scheduleSave();
      emit();
      if (window.FirebaseSync && FirebaseSync.enabled) FirebaseSync.push(key, value);
    },
    saveNow() {
      clearTimeout(saveTimer);
      saveNow();
    },
    ready() { return idbLoadPromise; },
    update(key, fn) {
      state[key] = fn(state[key]);
      scheduleSave();
      emit();
      if (window.FirebaseSync && FirebaseSync.enabled) FirebaseSync.push(key, state[key]);
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    uid() { return Math.random().toString(36).slice(2, 10); },

    // מפתח תאריך לפי הזמן המקומי — ולא UTC. ⚠️ באג קודם: toISOString() מחזיר
    // UTC, כך שתאריך שנבנה בחצות מקומית (כמו בתצוגה החודשית) התגלגל יום
    // אחורה באזורי-זמן חיוביים (ישראל), בעוד תאריך שנבנה עם שעת-יום (השבועי)
    // לא — מה שגרם לאי-התאמה בין התצוגות. רכיבים מקומיים = עקבי בכל מקום.
    dateKey(d) {
      var p = function (n) { return (n < 10 ? '0' : '') + n; };
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    },
    todayKey() { return this.dateKey(new Date()); },

    reset() {
      state = structuredClone(DEFAULTS);
      saveNow();
      emit();
    },

    exportJSON() {
      downloadJSON(state, `notebook-backup-${new Date().toISOString().slice(0, 10)}.json`);
    },

    // Export a SINGLE notebook (a root topic + its sub-topics) to a portable
    // file. Importing it merges by id and never overwrites other data — the
    // safe way to move one notebook between devices.
    exportNotebook(topics, name) {
      const safe = String(name || 'מחברת').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 40) || 'מחברת';
      downloadJSON(
        { _type: 'mahberet-notebook', version: 1, exportedAt: Date.now(), name: name || '', topics: topics || [] },
        `notebook-${safe}-${new Date().toISOString().slice(0, 10)}.json`
      );
    },

    importJSON(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const parsed = JSON.parse(reader.result);
            // Single-notebook file → merge into existing topics (additive, never
            // wipes other notebooks or any other data). This is the safe path.
            if (parsed && parsed._type === 'mahberet-notebook' && Array.isArray(parsed.topics)) {
              const before = (state.topics || []).length;
              const merged = mergeTopicsById(state.topics || [], parsed.topics);
              state.topics = merged;
              saveNow();
              emit();
              if (window.FirebaseSync && FirebaseSync.enabled) FirebaseSync.push('topics', merged);
              resolve({ mode: 'notebook', incoming: parsed.topics.length, added: merged.length - before });
              return;
            }
            // Full backup file → replace the entire state (legacy behavior).
            state = Object.assign(structuredClone(DEFAULTS), parsed);
            saveNow();
            emit();
            if (window.FirebaseSync && FirebaseSync.enabled) {
              Object.keys(state).forEach(k => FirebaseSync.push(k, state[k]));
            }
            resolve({ mode: 'full' });
          } catch (e) {
            reject(e);
          }
        };
        reader.onerror = reject;
        reader.readAsText(file);
      });
    }
  };

  window.Store = Store;
})();
