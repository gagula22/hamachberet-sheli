(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // מצב ניווט — אחריות עצמאית (window.NavMode).
  // קובע איך 7 הכלים של "המרכז היומי" (group:'daily') מוצגים בסרגל:
  //   'flat'  — כרגיל, כל כלי פריט נפרד (המצב המקורי).
  //   'group' — קבוצה נפתחת בסרגל (אפשרות א): פריט-אב מתקפל עם הכלים תחתיו.
  //   'hub'   — עמוד-מרכז עם לשוניות (אפשרות ב): פריט אחד → #/hub.
  // sidebar.js קורא NavMode.get() בזמן רינדור; js/views/hub מממש את עמוד-המרכז.
  // אפס שינוי ב-views עצמם. נשמר מקומית (mahberet.navMode); כרטיס בהגדרות.
  // ─────────────────────────────────────────────────────────────────────────

  var KEY = 'mahberet.navMode';
  var DEFAULT = 'group';   // בחירת המשתמש: "קבוצה נפתחת" (אפשרות א) כברירת מחדל
  var VALID = { flat: 1, group: 1, hub: 1 };

  // ── צרורות "המרכז היומי" ──────────────────────────────────────────────────
  // 7 הכלים מאוחדים ל-4 ילדים לפי רעיון משותף. צרור = עמוד-מיני עם לשוניות
  // שמארח views קיימים (members) — אפס שינוי בקוד שלהם. יומן נשאר עצמאי.
  var BUNDLES = [
    { id: 'tasks', title: 'משימות', icon: '✅', color: 'blush', members: [
        { id: 'todos', title: 'רשימה', icon: '✅' },
        { id: 'eisenhower', title: 'מטריצת סדר יום', icon: '🎯' }
    ] },
    { id: 'daily-track', title: 'מעקב יומי', icon: '🌿', color: 'sage', members: [
        { id: 'mood', title: 'מצב רוח', icon: '💭' },
        { id: 'water', title: 'שתייה ושינה', icon: '💧' },
        { id: 'habits', title: 'מעקב הרגלים', icon: '🌱' }
    ] },
    { id: 'knowledge', title: 'ידע וזיכרון', icon: '📝', color: 'lavender', members: [
        { id: 'notes', title: 'הערות', icon: '📝' },
        { id: 'flashcards', title: 'כרטיסיות זיכרון', icon: '🧠' }
    ] }
  ];
  function bundleById(id) { return BUNDLES.filter(function (b) { return b.id === id; })[0] || null; }

  // 4 הילדים של "המרכז היומי": יומן (עצמאי) + 3 צרורות.
  function dailyChildren() {
    return [
      { id: 'calendar', title: 'יומן', icon: '📅', color: 'butter', route: '#/calendar' }
    ].concat(BUNDLES.map(function (b) {
      return { id: b.id, title: b.title, icon: b.icon, color: b.color, route: '#/bundle/' + b.id, isBundle: true };
    }));
  }

  function get() {
    try { var m = localStorage.getItem(KEY); return VALID[m] ? m : DEFAULT; }
    catch (e) { return DEFAULT; }
  }
  function set(mode) {
    if (!VALID[mode]) mode = DEFAULT;
    try { localStorage.setItem(KEY, mode); } catch (e) {}
    // רינדור מחדש של הסרגל והמסך הנוכחי
    if (window.Sidebar && window.App) Sidebar.render(App.sections);
    if (window.App && App.render) {
      // אם היינו בכלי שהוסתר מהסרגל במצב hub — לא נוגעים בנתיב, רק מרעננים
      App.render();
    }
  }

  // האם הכלי הזה חבר ב"מרכז היומי"
  function isDaily(id) {
    var s = (window.App && App.sections || []).find(function (x) { return x.id === id; });
    return !!(s && s.group === 'daily');
  }
  function dailyTools() {
    return (window.App && App.sections || []).filter(function (s) { return s.group === 'daily'; });
  }

  // ── כרטיס בהגדרות ─────────────────────────────────────────────────────────
  function el(t, a, k) { return App.el(t, a || {}, k || []); }
  function card() {
    var OPTS = [
      { v: 'flat',  icon: '☰',  label: 'רגיל', sub: 'כל כלי בנפרד' },
      { v: 'group', icon: '🗂️', label: 'קבוצה נפתחת', sub: 'מקופלים תחת "המרכז היומי"' },
      { v: 'hub',   icon: '🗓️', label: 'עמוד-מרכז', sub: 'הכול בלשוניות בעמוד אחד' }
    ];
    var row = el('div', { class: 'settings-options nav-mode-opts' });
    OPTS.forEach(function (o) {
      var btn = el('button', {
        class: 'settings-opt' + (get() === o.v ? ' active' : ''),
        onClick: function () {
          set(o.v);
          row.querySelectorAll('.settings-opt').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          App.toast('סגנון התפריט עודכן');
        }
      }, [
        el('span', { class: 'settings-opt-icon' }, o.icon),
        el('span', {}, [el('div', {}, o.label), el('div', { class: 'nav-mode-sub' }, o.sub)])
      ]);
      row.appendChild(btn);
    });
    return el('div', { class: 'card settings-card' }, [
      el('h2', { class: 'settings-card-title' }, '🧭 סגנון התפריט'),
      el('div', { class: 'settings-card-sub' }, 'איך להציג את כלי "המרכז היומי" (יומן, הערות, משימות, מטריצה, מצב רוח, שתייה, כרטיסיות)'),
      row
    ]);
  }
  (window.SETTINGS_CARDS = window.SETTINGS_CARDS || []).push(card);

  window.NavMode = {
    get: get, set: set, isDaily: isDaily, dailyTools: dailyTools,
    bundles: function () { return BUNDLES; }, bundleById: bundleById, dailyChildren: dailyChildren
  };
})();
