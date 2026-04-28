(function () {
  const KEY = 'notebook.v1';
  const DEFAULTS = {
    notes: [],
    tasks: [],
    todos: [],
    habits: [
      { id: 'h1', name: 'לקרוא 20 דקות', color: 'sage', log: {} },
      { id: 'h2', name: 'פעילות גופנית', color: 'blush', log: {} },
      { id: 'h3', name: 'מדיטציה',       color: 'lavender', log: {} }
    ],
    mood: {},
    water: {},
    sleep: {},
    transactions: [],
    goals: [],
    slots: {},
    topics: [],
    settings: { userName: '', theme: 'cream' }
  };

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

  // After first paint, load from IndexedDB which may have larger / newer data
  idbGet(KEY).then(saved => {
    if (!saved) {
      // Nothing in IDB yet — migrate from localStorage if available
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          state = Object.assign(structuredClone(DEFAULTS), parsed);
          // Save to IDB, then clear localStorage to free space
          idbSet(KEY, state).then(() => {
            try { localStorage.removeItem(KEY); } catch {}
          }).catch(() => {});
          emit();
        }
      } catch {}
      return;
    }
    // IDB has data — use it and clear the old localStorage copy
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
    update(key, fn) {
      state[key] = fn(state[key]);
      scheduleSave();
      emit();
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    uid() { return Math.random().toString(36).slice(2, 10); },

    todayKey() {
      const d = new Date();
      return d.toISOString().slice(0, 10);
    },
    dateKey(d) { return d.toISOString().slice(0, 10); },

    reset() {
      state = structuredClone(DEFAULTS);
      saveNow();
      emit();
    },

    exportJSON() {
      const json = JSON.stringify(state, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `notebook-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },

    importJSON(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const parsed = JSON.parse(reader.result);
            state = Object.assign(structuredClone(DEFAULTS), parsed);
            saveNow();
            emit();
            if (window.FirebaseSync && FirebaseSync.enabled) {
              Object.keys(state).forEach(k => FirebaseSync.push(k, state[k]));
            }
            resolve();
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
