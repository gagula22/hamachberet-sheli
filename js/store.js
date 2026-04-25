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

  let state = load();
  const listeners = new Set();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULTS);
      const parsed = JSON.parse(raw);
      return Object.assign(structuredClone(DEFAULTS), parsed);
    } catch {
      return structuredClone(DEFAULTS);
    }
  }

  let saveTimer;
  function saveNow() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) {
      if (window.App) App.toast('אין מספיק מקום לשמירה — נסה למחוק תמונות');
      console.warn('Storage error:', e);
    }
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

    // Internal: update localStorage only, no cloud push (used by FirebaseSync.pullFromCloud)
    _local(key, value) {
      state[key] = value;
      scheduleSave();
    },

    set(key, value) {
      state[key] = value;
      scheduleSave();
      emit();
      if (window.FirebaseSync && FirebaseSync.enabled) FirebaseSync.push(key, value);
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
    }
  };

  window.Store = Store;
})();
