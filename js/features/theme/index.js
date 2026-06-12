(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // ערכת נושא — אחריות עצמאית (window.Theme).
  // boot.js כבר החיל את הערכה לפני הציור; הקובץ הזה מספק:
  //   • API: Theme.set('cream'|'dark'|'auto'), Theme.setFontSize('s'|'m'|'l')
  //   • התמדה כפולה: מראה ב-localStorage (לציור מוקדם) + Store.settings (לסנכרון)
  //   • מצב 'auto' שמגיב לשינוי ערכת מערכת ההפעלה בזמן אמת
  //   • עדכון <meta name="theme-color"> ואירוע 'themechange' (לתובנות/גרפים)
  // Store מנצח על המראה אחרי טעינה — מכסה ייבוא/שחזור נתונים ממכשיר אחר.
  // ─────────────────────────────────────────────────────────────────────────

  var MIRROR_KEY = 'mahberet.theme';
  var META_COLORS = { cream: '#FAF6F0', dark: '#181512' };

  var _mode = 'cream', _fs = 'm';
  try {
    var p = JSON.parse(localStorage.getItem(MIRROR_KEY) || '{}');
    _mode = p.mode || 'cream';
    _fs = p.fs || 'm';
  } catch (e) {}

  function prefersDark() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function resolved() { return _mode === 'auto' ? (prefersDark() ? 'dark' : 'cream') : _mode; }

  function apply() {
    var r = resolved();
    if (r === 'dark') document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
    if (_fs !== 'm') document.documentElement.dataset.fs = _fs;
    else delete document.documentElement.dataset.fs;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', META_COLORS[r] || META_COLORS.cream);
    try { window.dispatchEvent(new CustomEvent('themechange', { detail: { mode: _mode, resolved: r, fs: _fs } })); } catch (e) {}
  }

  function mirror() {
    try { localStorage.setItem(MIRROR_KEY, JSON.stringify({ mode: _mode, fs: _fs })); } catch (e) {}
  }

  function persistToStore() {
    if (!(window.Store && Store.get)) return;
    var s = Object.assign({}, Store.get('settings') || {});
    if (s.theme !== _mode || s.fontSize !== _fs) {
      s.theme = _mode;
      s.fontSize = _fs;
      Store.set('settings', s);
    }
  }

  function set(mode) {
    if (mode !== 'cream' && mode !== 'dark' && mode !== 'auto') mode = 'cream';
    _mode = mode;
    mirror(); apply(); persistToStore();
  }
  function setFontSize(fs) {
    if (fs !== 's' && fs !== 'm' && fs !== 'l') fs = 'm';
    _fs = fs;
    mirror(); apply(); persistToStore();
  }

  // סנכרון מול Store: אחרי הטעינה Store מנצח, ושינויי settings (ייבוא/שחזור)
  // מוחלים מיידית. ההשוואה מונעת לולאת set→subscribe.
  function syncFromStore() {
    var s = Store.get('settings') || {};
    var m = s.theme || 'cream', f = s.fontSize || 'm';
    if (m !== _mode || f !== _fs) { _mode = m; _fs = f; mirror(); apply(); }
  }
  if (window.Store && Store.ready) {
    Store.ready().then(function () {
      syncFromStore();
      Store.subscribe(syncFromStore);
    }).catch(function () {});
  }

  // מצב אוטומטי: תגובה חיה לשינוי ערכת מערכת ההפעלה
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onOs = function () { if (_mode === 'auto') apply(); };
    if (mq.addEventListener) mq.addEventListener('change', onOs);
    else if (mq.addListener) mq.addListener(onOs);
  }

  window.Theme = {
    set: set,
    setFontSize: setFontSize,
    mode: function () { return _mode; },
    fontSize: function () { return _fs; },
    resolved: resolved
  };
})();
