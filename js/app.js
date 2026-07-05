(function () {
  const SECTIONS = [
    { id: 'dashboard', title: 'לוח בקרה',       icon: '🏠', color: 'blush',    desc: 'המסך הראשי שלך' },
    { id: 'notebook',  title: 'מחברת',           icon: '📓', color: 'lavender', desc: 'כתיבה חופשית עם נושאים ותמונות' },
    { id: 'graph',     title: 'מפת קשרים',       icon: '🕸️', color: 'sky',      desc: 'כל הנושאים והקישורים ביניהם' },
    { id: 'highlights',title: 'מרכז הדגשות',     icon: '🖍️', color: 'butter',   desc: 'כל מה שסימנת במרקר, במקום אחד', group: 'knowledge' },
    { id: 'calendar',  title: 'יומן',            icon: '📅', color: 'butter',   desc: 'יומי, שבועי, חודשי', group: 'daily' },
    { id: 'weekly-review', title: 'סקירה שבועית', icon: '🧭', color: 'sage',    desc: 'מה הלך טוב, מה לשפר, ומה עובר הלאה' },
    { id: 'notes',     title: 'הערות',           icon: '📝', color: 'lavender', desc: 'לכל רעיון ומחשבה', group: 'knowledge' },
    { id: 'voice',     title: 'הערות קול',       icon: '🎙️', color: 'blush',    desc: 'תזכירים קוליים — נשמרים רק במחשב', group: 'knowledge' },
    { id: 'sketch',    title: 'לוח שרטוט',       icon: '✏️', color: 'lavender', desc: 'ציור חופשי — ומשם ישר למחברת', group: 'knowledge' },
    { id: 'flashcards',title: 'כרטיסיות זיכרון', icon: '🧠', color: 'sage',     desc: 'חזרה מרווחת — לזכור לטווח ארוך', group: 'knowledge' },
    { id: 'readinglist', title: 'רשימת קריאה',   icon: '🔖', color: 'sky',      desc: 'קישורים שנשמרו לקריאה אחר-כך' },
    { id: 'todos',     title: 'משימות',          icon: '✅', color: 'blush',    desc: 'לסיים את העניינים', group: 'daily' },
    { id: 'eisenhower',title: 'מטריצת סדר יום',  icon: '🎯', color: 'butter',   desc: 'דחוף/חשוב — ארבעה רבעים', group: 'daily' },
    { id: 'habits',    title: 'מעקב הרגלים',     icon: '🌱', color: 'sage',     desc: 'צור רצף של הצלחה', group: 'daily' },
    { id: 'mood',      title: 'יומן מצב רוח',    icon: '💭', color: 'lavender', desc: 'תעצור רגע להקשיב לעצמך', group: 'daily' },
    { id: 'water',     title: 'שתייה ושינה',     icon: '💧', color: 'sky',      desc: 'שתייה ומנוחה', group: 'daily' },
    { id: 'budget',    title: 'תקציב',           icon: '💰', color: 'butter',   desc: 'עקוב אחרי הכסף' },
    { id: 'goals',     title: 'מטרות',           icon: '🎯', color: 'blush',    desc: 'לחלום, להגשים', group: 'daily' },
    { id: 'insights',  title: 'תובנות',          icon: '📊', color: 'sage',     desc: 'גרפים ומגמות מהנתונים שלך' },
    { id: 'filedash',  title: 'מעבדת דשבורדים',  icon: '🧪', color: 'sky',      desc: 'כל קובץ — Excel, CSV, PDF, Word — הופך לדשבורד עם תובנות' },
    { id: 'tripmap',   title: 'מפת טיולים',      icon: '🗺️', color: 'sky',      desc: 'מפת ישראל בתלת־מימד + תכנון מסלולים' },
    { id: 'wyckoff',   title: 'ניתוח לפי וויקוף', icon: '📈', color: 'sage',     desc: 'ניתוח קריפטו חי לפי וויקוף — ללא תוכנת טריידינג, רץ דרך הרשת מנתוני Binance' },
    { id: 'docstudio', title: 'סטודיו מסמכים',    icon: '📄', color: 'butter',   desc: 'הצעות מחיר, חוזים, חשבוניות ומכתבים — PDF ו-Word בעברית תקינה' },
    { id: 'stickers',  title: 'כלים',             icon: '🛠️', color: 'lavender', desc: 'כלים שימושיים' },
    { id: 'assistant', title: 'עוזר חכם',         icon: '🤖', color: 'sage',     desc: 'שאל אותי כל דבר על האתר ועל התוכן שלך' },
    { id: 'pmkit',     title: 'ארגז PM',           icon: '🧰', color: 'lavender', desc: 'מחוללי פרומפטים לניהול מוצר: מפרט, roadmap, ספרינט, מדדים ועוד' },
    { id: 'searchstudio', title: 'סטודיו חיפוש',   icon: '🔎', color: 'sky',      desc: 'בונה פקודות /search ו-/digest לחיפוש הארגוני של Cowork' },
    { id: 'prompts',   title: 'פרומטים',          icon: '📋', color: 'lavender', desc: 'פרומטים לשימוש חוזר — להעתקה' },
    { id: 'settings',  title: 'הגדרות',           icon: '⚙️', color: 'sky',      desc: 'שם, ערכת נושא וגודל טקסט' },
    // עמוד-המרכז (אפשרות ב) — מנותב כ-#/hub/<כלי>. navHidden: לא מוצג כפריט
    // רגיל בסרגל; הסרגל מסנתז אותו בעצמו במצב 'hub'. כאן רק כדי ש-render
    // יזהה את הנתיב ויציג כותרת.
    { id: 'hub',       title: 'המרכז היומי',      icon: '🗓️', color: 'sky',      desc: 'כל הכלים היומיים במקום אחד', navHidden: true },
    // עמוד-צרור (משימות / מעקב יומי / ידע וזיכרון) — נתיב #/bundle/<id>.
    // navHidden: לא פריט בסרגל; הכותרת נקבעת דינמית בתוך ה-view.
    { id: 'bundle',    title: 'המרכז היומי',      icon: '🗓️', color: 'sky',      desc: 'צרור כלים', navHidden: true }
  ];

  const LEGACY_REDIRECTS = { daily: 'calendar/daily', weekly: 'calendar/weekly', monthly: 'calendar/monthly' };

  const QUOTES = [
    '"צעד קטן, כל יום."',
    '"עמוד ביום — שקט בראש."',
    '"אתה הסופר של הסיפור שלך."',
    '"לנשום, לתכנן, להתחיל."',
    '"התקדמות, לא שלמות."'
  ];

  // הקיבוץ של הכלים לקבוצות ("המרכז היומי" ו"ידע ולכידה") מוגדר כולו
  // ב-js/features/navmode (window.NavMode), שקורא את שדה group של ה-SECTIONS.
  // sidebar.js + js/views/hub קוראים מ-NavMode; ה-views עצמם לא יודעים שהם מקובצים.

  // Views שמנהלים בעצמם רענון-על-נתונים (נרשמים ל-Store.subscribe לבד) — אסור
  // שה-hook הגלובלי onCloudUpdate יכפה עליהם App.render(): זה היה גורם לרינדור
  // כפול (insights) או לבניית-מחדש של מפת ה-3D ואיפוס המצלמה (tripmap). הם
  // שומרים על האחריות שלהם; ה-hook מדלג עליהם ומשאיר את ההתנהגות הקיימת.
  const SELF_MANAGED_ROUTES = new Set(['tripmap', 'insights']);

  const App = {
    sections: SECTIONS,
    _routes: {},

    register(id, renderFn) { this._routes[id] = renderFn; },

    start() {
      this.bindChrome();
      window.addEventListener('hashchange', () => this.render());
      if (!location.hash) location.hash = '#/dashboard';
      this.render();
      // A hard refresh paints immediately from the (empty) localStorage state,
      // then IndexedDB loads asynchronously. Re-render the current view once it
      // is ready so data views (e.g. the notebook topic tree) aren't stuck
      // empty until the user navigates away and back.
      if (window.Store && Store.ready) {
        Store.ready().then(() => this.render()).catch(() => {});
      }
      // אם נתוני ענן הגיעו בזמן עריכה, onCloudUpdate דחה את הרינדור (כדי לא
      // לאבד את הסמן). ברגע שהעריכה מסתיימת — מציירים מחדש עם הנתונים הטריים.
      document.addEventListener('focusout', () => {
        if (this._cloudPending) {
          this._cloudPending = false;
          setTimeout(() => this.render(), 0);
        }
      });
    },

    syncTopbarHeight() {
      const topbar = document.querySelector('.topbar');
      if (!topbar) return;
      const h = Math.ceil(topbar.getBoundingClientRect().height);
      if (h > 0) document.documentElement.style.setProperty('--topbar-h', h + 'px');
    },

    bindChrome() {
      Sidebar.render(SECTIONS);
      const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
      document.getElementById('dailyQuote').textContent = quote;

      const todayChip = document.getElementById('todayChip');
      const now = new Date();
      todayChip.textContent = now.toLocaleDateString('he-IL', { weekday: 'long', month: 'long', day: 'numeric' });

      // Hamburger toggle (desktop/tablet)
      document.getElementById('menuToggle').addEventListener('click', () => {
        document.body.classList.toggle('nav-open');
      });

      // Overlay — close sidebar when tapping outside on mobile
      const overlay = document.createElement('div');
      overlay.className = 'nav-overlay';
      overlay.addEventListener('click', () => document.body.classList.remove('nav-open'));
      document.body.appendChild(overlay);

      // Close sidebar on nav-item click (mobile)
      document.getElementById('nav').addEventListener('click', () => {
        if (window.innerWidth <= 900) document.body.classList.remove('nav-open');
      });

      // Bottom navigation bar (mobile)
      const bnMore = document.getElementById('bnMore');
      if (bnMore) {
        bnMore.addEventListener('click', () => document.body.classList.toggle('nav-open'));
      }
      document.querySelectorAll('.bn-item[data-route]').forEach(btn => {
        btn.addEventListener('click', () => {
          location.hash = '#/' + btn.dataset.route;
          document.body.classList.remove('nav-open');
        });
      });

      document.getElementById('globalSearch').addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        if (!q) return;
        const notes = Store.get('notes') || [];
        const match = notes.find(n => (n.title + ' ' + n.body).toLowerCase().includes(q));
        if (match) {
          sessionStorage.setItem('openNoteId', match.id);
          location.hash = '#/notes';
        }
      });
    },

    render() {
      const path = (location.hash || '#/dashboard').replace(/^#\//, '');
      const parts = path.split('/');
      const id = parts[0] || 'dashboard';
      const sub = parts[1];

      if (LEGACY_REDIRECTS[id]) {
        location.hash = '#/' + LEGACY_REDIRECTS[id];
        return;
      }

      const section = SECTIONS.find(s => s.id === id) || SECTIONS[0];
      document.getElementById('crumbs').textContent = section.title;
      document.getElementById('pageTitle').textContent = section.id === 'dashboard' ? this.greeting() : section.title;
      document.body.classList.remove('nav-open');
      Sidebar.setActive(section.id);

      // Sync bottom nav active state
      document.querySelectorAll('.bn-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.route === section.id);
      });

      const view = document.getElementById('view');
      view.innerHTML = '';
      const fn = this._routes[section.id];
      if (fn) fn(view, sub);
      else view.innerHTML = `<div class="empty-state">החלק הזה עוד בהכנה…</div>`;
      view.style.animation = 'none';
      void view.offsetWidth;
      view.style.animation = '';
    },

    // נתוני ענן נחתו אחרי הרינדור הראשוני (במיוחד במובייל, שם הענן מגיע מאוחר).
    // ה-state כבר מעודכן — אבל המסך הנוכחי לא מצויר מחדש מעצמו (App לא נרשם
    // ל-Store.subscribe, והסְנאפשוט הראשון משתמש ב-_local בלי emit). בלי זה,
    // תצוגת המחברת נתקעת על הנתונים הישנים עד מעבר עמוד — זה הבאג של "הטלפון
    // מציג רק 23". מרנדרים מחדש את המסך הנוכחי, אבל לא תוך כדי עריכה פעילה
    // (contenteditable/input ממוקד) — רינדור היה מאבד את הסמן; דוחים ל-focusout.
    onCloudUpdate() {
      // views שמנהלים את עצמם — לא לכפות עליהם רינדור גלובלי (ראה SELF_MANAGED_ROUTES).
      const route = (location.hash || '').replace(/^#\//, '').split('/')[0];
      if (SELF_MANAGED_ROUTES.has(route)) return;
      const ae = document.activeElement;
      if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
        this._cloudPending = true;
        return;
      }
      this.render();
    },

    greeting() {
      const name = (Store.get('settings') || {}).userName || '';
      const h = new Date().getHours();
      const part = h < 12 ? 'בוקר טוב' : h < 18 ? 'צהריים טובים' : 'ערב טוב';
      return name ? `${part}, ${name}` : part;
    },

    toast(msg) {
      let t = document.querySelector('.toast');
      if (!t) {
        t = document.createElement('div');
        t.className = 'toast';
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(App._toastTimer);
      App._toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
    },

    el(tag, attrs = {}, children = []) {
      const node = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') node.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'html') node.innerHTML = v;
        else if (v !== false && v != null) node.setAttribute(k, v);
      }
      const arr = Array.isArray(children) ? children : [children];
      arr.forEach(c => {
        if (c == null || c === false) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
      return node;
    }
  };

  window.App = App;

  // Keep --topbar-h accurate so .nb-toolbar sticky offset stays correct
  document.addEventListener('DOMContentLoaded', () => {
    App.syncTopbarHeight();
    window.addEventListener('resize', () => App.syncTopbarHeight());
    if (window.ResizeObserver) {
      const topbar = document.querySelector('.topbar');
      if (topbar) new ResizeObserver(() => App.syncTopbarHeight()).observe(topbar);
    }
  });
})();
