(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // גיבוי גרסאות אוטומטי — אחריות עצמאית (window.AutoBackup).
  // למה: סנכרון הענן מגבה את המצב הנוכחי, אבל מחיקה בטעות מסתנכרנת מיד —
  // אין "מצב של אתמול". כאן: צילום יומי של כל ה-Store ל-IndexedDB משלנו
  // ('hamachberet-backups'), שמירת 14 הימים האחרונים, ושחזור בלחיצה דרך
  // המסלול המוכח Store.importJSON (זה של ייבוא-הדבקה ב-data-transfer).
  // לפני כל שחזור נשמר צילום-בטיחות של המצב הנוכחי.
  // UI: כרטיס שנרשם ל-window.SETTINGS_CARDS (תלות רכה — אם מסך ההגדרות
  // לא קיים, הגיבוי היומי עדיין רץ ברקע).
  // ─────────────────────────────────────────────────────────────────────────

  const DB_NAME = 'hamachberet-backups', STORE = 'snapshots', KEEP = 14;

  let _dbP = null;
  function db() {
    if (_dbP) return _dbP;
    _dbP = new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'dateKey' });
        }
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    return _dbP;
  }
  function getAll() {
    return db().then(d => new Promise((res, rej) => {
      const req = d.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => res((req.result || []).sort((a, b) => b.dateKey.localeCompare(a.dateKey)));
      req.onerror = () => rej(req.error);
    }));
  }
  function put(snap) {
    return db().then(d => new Promise((res, rej) => {
      const t = d.transaction(STORE, 'readwrite');
      t.objectStore(STORE).put(snap);
      t.oncomplete = res; t.onerror = () => rej(t.error);
    }));
  }
  function del(dateKey) {
    return db().then(d => new Promise((res, rej) => {
      const t = d.transaction(STORE, 'readwrite');
      t.objectStore(STORE).delete(dateKey);
      t.oncomplete = res; t.onerror = () => rej(t.error);
    }));
  }

  function snapshotNow() {
    const data = JSON.parse(JSON.stringify(Store.get() || {}));
    const snap = { dateKey: Store.todayKey(), createdAt: Date.now(), data: data };
    return put(snap).then(prune).then(() => snap);
  }
  function prune() {
    return getAll().then(all =>
      Promise.all(all.slice(KEEP).map(s => del(s.dateKey)))
    );
  }

  function restore(dateKey) {
    return getAll().then(all => {
      const snap = all.find(s => s.dateKey === dateKey);
      if (!snap) throw new Error('snapshot not found');
      // צילום-בטיחות של המצב הנוכחי לפני הדריסה (נשמר תחת היום של היום)
      return snapshotNow().then(() => {
        const file = new File([JSON.stringify(snap.data)], 'backup-' + dateKey + '.json', { type: 'application/json' });
        return Store.importJSON(file);
      });
    });
  }

  // ── גיבוי יומי אוטומטי ───────────────────────────────────────────────────
  function dailyTick() {
    getAll().then(all => {
      const today = Store.todayKey();
      if (!all.some(s => s.dateKey === today)) {
        snapshotNow().catch(e => console.warn('autobackup failed:', e));
      }
    }).catch(e => console.warn('autobackup check failed:', e));
  }
  if (window.Store && Store.ready) {
    Store.ready().then(dailyTick).catch(() => {});
  }

  // ── כרטיס במסך ההגדרות (תלות רכה) ───────────────────────────────────────
  function fmtSize(n) { return n > 1024 * 1024 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function el(tag, attrs, kids) { return App.el(tag, attrs || {}, kids || []); }

  function card() {
    const list = el('div', { class: 'ab-list' }, 'טוען…');
    function refresh() {
      getAll().then(all => {
        list.innerHTML = '';
        if (!all.length) {
          list.appendChild(el('div', { class: 'ab-empty' }, 'עוד אין צילומי גיבוי — הראשון ייווצר אוטומטית.'));
          return;
        }
        all.forEach(s => {
          const d = new Date(s.createdAt);
          list.appendChild(el('div', { class: 'ab-row' }, [
            el('span', { class: 'ab-date' }, d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })),
            el('span', { class: 'ab-size' }, fmtSize(JSON.stringify(s.data).length)),
            el('button', {
              class: 'ab-restore',
              onClick: () => {
                if (!confirm('לשחזר את הנתונים מ-' + s.dateKey + '?\nהמצב הנוכחי יישמר קודם כצילום-בטיחות של היום.')) return;
                restore(s.dateKey).then(() => {
                  App.toast('♻️ הנתונים שוחזרו מ-' + s.dateKey);
                  setTimeout(() => location.reload(), 800);
                }).catch(() => App.toast('השחזור נכשל'));
              }
            }, 'שחזר')
          ]));
        });
      }).catch(() => { list.textContent = 'טעינת הגיבויים נכשלה.'; });
    }
    refresh();
    const nowBtn = el('button', { class: 'ab-now', onClick: () => {
      snapshotNow().then(() => { App.toast('💾 נשמר צילום גיבוי'); refresh(); }).catch(() => App.toast('הגיבוי נכשל'));
    } }, '💾 גבה עכשיו');
    return el('div', { class: 'card settings-card' }, [
      el('h2', { class: 'settings-card-title' }, '🗄️ גיבוי אוטומטי'),
      el('div', { class: 'settings-card-sub' }, 'צילום יומי של כל הנתונים, נשמר מקומית (14 ימים אחורה). שחזור מחזיר את האתר למצב של אותו יום.'),
      nowBtn,
      list
    ]);
  }
  (window.SETTINGS_CARDS = window.SETTINGS_CARDS || []).push(card);

  window.AutoBackup = { list: getAll, restore: restore, snapshotNow: snapshotNow };
})();
