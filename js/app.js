(function () {
  const SECTIONS = [
    { id: 'dashboard', title: 'לוח בקרה',       icon: '🏠', color: 'blush',    desc: 'המסך הראשי שלך' },
    { id: 'notebook',  title: 'מחברת',           icon: '📓', color: 'lavender', desc: 'כתיבה חופשית עם נושאים ותמונות' },
    { id: 'calendar',  title: 'יומן',            icon: '📅', color: 'butter',   desc: 'יומי, שבועי, חודשי' },
    { id: 'notes',     title: 'הערות',           icon: '📝', color: 'lavender', desc: 'לכל רעיון ומחשבה' },
    { id: 'todos',     title: 'משימות',          icon: '✅', color: 'blush',    desc: 'לסיים את העניינים' },
    { id: 'habits',    title: 'מעקב הרגלים',     icon: '🌱', color: 'sage',     desc: 'צור רצף של הצלחה' },
    { id: 'mood',      title: 'יומן מצב רוח',    icon: '💭', color: 'lavender', desc: 'תעצור רגע להקשיב לעצמך' },
    { id: 'water',     title: 'שתייה ושינה',     icon: '💧', color: 'sky',      desc: 'שתייה ומנוחה' },
    { id: 'budget',    title: 'תקציב',           icon: '💰', color: 'butter',   desc: 'עקוב אחרי הכסף' },
    { id: 'goals',     title: 'מטרות',           icon: '🎯', color: 'blush',    desc: 'לחלום, להגשים' },
    { id: 'stickers',  title: 'מדבקות',          icon: '✨', color: 'lavender', desc: 'קישוטים לעמודים שלך' }
  ];

  const LEGACY_REDIRECTS = { daily: 'calendar/daily', weekly: 'calendar/weekly', monthly: 'calendar/monthly' };

  const QUOTES = [
    '"צעד קטן, כל יום."',
    '"עמוד ביום — שקט בראש."',
    '"אתה הסופר של הסיפור שלך."',
    '"לנשום, לתכנן, להתחיל."',
    '"התקדמות, לא שלמות."'
  ];

  const App = {
    sections: SECTIONS,
    _routes: {},

    register(id, renderFn) { this._routes[id] = renderFn; },

    start() {
      this.bindChrome();
      window.addEventListener('hashchange', () => this.render());
      if (!location.hash) location.hash = '#/dashboard';
      this.render();
    },

    bindChrome() {
      Sidebar.render(SECTIONS);
      const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
      document.getElementById('dailyQuote').textContent = quote;

      const todayChip = document.getElementById('todayChip');
      const now = new Date();
      todayChip.textContent = now.toLocaleDateString('he-IL', { weekday: 'long', month: 'long', day: 'numeric' });

      document.getElementById('menuToggle').addEventListener('click', () => {
        document.body.classList.toggle('nav-open');
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

      const view = document.getElementById('view');
      view.innerHTML = '';
      const fn = this._routes[section.id];
      if (fn) fn(view, sub);
      else view.innerHTML = `<div class="empty-state">החלק הזה עוד בהכנה…</div>`;
      view.style.animation = 'none';
      void view.offsetWidth;
      view.style.animation = '';
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
})();
