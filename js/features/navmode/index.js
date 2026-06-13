(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // מצב ניווט — אחריות עצמאית (window.NavMode).
  // מאחד כלים לקבוצות. שתי קבוצות (GROUPS): "המרכז היומי" ו"ידע ולכידה".
  // המתג (mahberet.navMode) קובע איך כל הקבוצות מוצגות בסרגל:
  //   'flat'  — כל כלי פריט נפרד (המצב המקורי).
  //   'group' — כל קבוצה נפתחת בסרגל (פריט-אב מתקפל עם הילדים).
  //   'hub'   — כל קבוצה = פריט אחד → עמוד-מרכז עם לשוניות (#/hub/<groupId>).
  // צרור (bundle) = ילד שמאגד כמה views תחת לשוניות-משנה (משימות, מעקב יומי).
  // sidebar.js קורא מכאן; js/views/hub מממש את עמודי-המרכז והצרורות.
  // אפס שינוי ב-views עצמם. כרטיס שליטה בהגדרות.
  // ─────────────────────────────────────────────────────────────────────────

  var KEY = 'mahberet.navMode';
  var DEFAULT = 'group';
  var VALID = { flat: 1, group: 1, hub: 1 };

  // ── צרורות (כלי-אב עם לשוניות-משנה) ───────────────────────────────────────
  var BUNDLES = [
    { id: 'tasks', title: 'משימות', icon: '✅', color: 'blush', members: [
        { id: 'todos', title: 'רשימה', icon: '✅' },
        { id: 'eisenhower', title: 'מטריצת סדר יום', icon: '🎯' }
    ] },
    { id: 'daily-track', title: 'מעקב יומי', icon: '🌿', color: 'sage', members: [
        { id: 'mood', title: 'מצב רוח', icon: '💭' },
        { id: 'water', title: 'שתייה ושינה', icon: '💧' },
        { id: 'habits', title: 'מעקב הרגלים', icon: '🌱' }
    ] }
  ];
  function bundleById(id) { return BUNDLES.filter(function (b) { return b.id === id; })[0] || null; }

  // ── קבוצות ─────────────────────────────────────────────────────────────────
  // child: { view:id } (כלי בודד) או { bundle:id } (צרור עם לשוניות).
  var GROUPS = [
    { id: 'daily', title: 'המרכז היומי', icon: '🗓️', color: 'sky', children: [
        { view: 'calendar', title: 'יומן', icon: '📅', color: 'butter' },
        { bundle: 'tasks' },
        { bundle: 'daily-track' },
        { view: 'goals', title: 'מטרות', icon: '🎯', color: 'blush' }
    ] },
    { id: 'knowledge', title: 'ידע ולכידה', icon: '📚', color: 'lavender', children: [
        { view: 'notes', title: 'הערות', icon: '📝', color: 'lavender' },
        { view: 'sketch', title: 'לוח שרטוט', icon: '✏️', color: 'lavender' },
        { view: 'highlights', title: 'מרכז הדגשות', icon: '🖍️', color: 'butter' },
        { view: 'flashcards', title: 'כרטיסיות זיכרון', icon: '🧠', color: 'sage' },
        { view: 'voice', title: 'הערות קול', icon: '🎙️', color: 'blush' }
    ] }
  ];
  function groupById(id) { return GROUPS.filter(function (g) { return g.id === id; })[0] || null; }

  // הופך child גולמי לאובייקט תצוגה אחיד {id,title,icon,color,route,isBundle}
  function resolveChild(c) {
    if (c.bundle) {
      var b = bundleById(c.bundle);
      return b ? { id: b.id, title: b.title, icon: b.icon, color: b.color, route: '#/bundle/' + b.id, isBundle: true } : null;
    }
    return { id: c.view, title: c.title, icon: c.icon, color: c.color, route: '#/' + c.view };
  }
  function groupChildren(groupId) {
    var g = groupById(groupId);
    return g ? g.children.map(resolveChild).filter(Boolean) : [];
  }

  // לאיזו קבוצה שייך section (לפי שדה group). משמש את הסרגל ל-setActive ולדילוג.
  function groupOf(sectionId) {
    var s = (window.App && App.sections || []).filter(function (x) { return x.id === sectionId; })[0];
    return s ? s.group || null : null;
  }

  function get() {
    try { var m = localStorage.getItem(KEY); return VALID[m] ? m : DEFAULT; }
    catch (e) { return DEFAULT; }
  }
  function set(mode) {
    if (!VALID[mode]) mode = DEFAULT;
    try { localStorage.setItem(KEY, mode); } catch (e) {}
    if (window.Sidebar && window.App) Sidebar.render(App.sections);
    if (window.App && App.render) App.render();
  }

  // ── כרטיס בהגדרות ─────────────────────────────────────────────────────────
  function el(t, a, k) { return App.el(t, a || {}, k || []); }
  function card() {
    var OPTS = [
      { v: 'flat',  icon: '☰',  label: 'רגיל', sub: 'כל כלי בנפרד' },
      { v: 'group', icon: '🗂️', label: 'קבוצות נפתחות', sub: 'מקופלים תחת פריט-אב' },
      { v: 'hub',   icon: '🗓️', label: 'עמוד-מרכז', sub: 'הכול בלשוניות' }
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
      el('div', { class: 'settings-card-sub' }, 'איך להציג את קבוצות הכלים — "המרכז היומי" ו"ידע ולכידה": כל כלי בנפרד, מקובצים ונפתחים, או בעמוד-מרכז עם לשוניות.'),
      row
    ]);
  }
  (window.SETTINGS_CARDS = window.SETTINGS_CARDS || []).push(card);

  window.NavMode = {
    get: get, set: set,
    groups: function () { return GROUPS; }, groupById: groupById,
    groupChildren: groupChildren, groupOf: groupOf,
    bundles: function () { return BUNDLES; }, bundleById: bundleById
  };
})();
