(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // עמוד "פרומטים" — אקורדיון מתקפל + ניהול ידני מלא.
  // כל הפרומטים נשמרים ב-Store('prompts') (subcol, מסונכרן/מגובה) וניתנים
  // לעריכת שם/סקיל/תוכן ולמחיקה. פרומט onboarding נזרע פעם אחת (SEED) עם
  // מזהה קבוע — כך גם הוא ניתן לעריכה, ומיזוג by-id מונע כפילות בין מכשירים.
  // כל פרומט: { id, skill, title, body }. ברירת מחדל: כולם סגורים.
  // ─────────────────────────────────────────────────────────────────────────

  function el(t, a, k) { return App.el(t, a || {}, k || []); }

  var SEED_FLAG = 'mahberet.prompts.seeded';
  var SEED = [
    {
      id: 'onboarding-skill',
      skill: 'קיבוץ הניווט — שתי קבוצות ("המרכז היומי" + "ידע ולכידה") · navmode',
      title: 'להמשך עבודה להטמעה של סקיל',
      body: [
        'אני עובד על אפליקציית PWA בעברית (RTL) בשם "המחברת שלי" (gagula22.github.io/hamachberet-sheli).',
        'לפני שתתחיל לעבוד — קרא את כל מקורות ההקשר הבאים, לפי הסדר, כדי לקבל את התמונה המלאה:',
        '',
        '## 1. זיכרון (נטען אוטומטית, אבל ודא שקראת)',
        '- MEMORY.md — אינדקס הזיכרון',
        '- hamachberet-soc-workflow.md — כלל העבודה: לפני כל שינוי לאתר ב-ARCHITECTURE.md מי האחראי, ולגעת רק בקובץ הזה',
        '- hamachberet-architecture.md — מפת המודולים והמרחבים (namespaces)',
        '- hamachberet-navmode-groups.md — מצב פיצ\'ר קיבוץ הניווט (העדכני ביותר)',
        '- hamachberet-tripmap.md, hamachberet-wyckoff.md, hamachberet-pdf-tools-roadmap.md — פיצ\'רים עצמאיים שכבר בחי',
        '',
        '## 2. תיעוד הקוד',
        'שני מאגרי git נפרדים:',
        '- אתר חי (LIVE): C:\\Users\\ACER\\Documents\\claude AI\\מחברת  (Firebase פעיל, port 7788, נפרס ל-GitHub Pages)',
        '- סנדבוקס פיתוח (DEV): C:\\Users\\ACER\\Documents\\claude AI\\אתר משופר עם fable 5  (port 7795, יש דגל IMPROVED_SITE_SANDBOX)',
        'קרא ARCHITECTURE.md בשני המאגרים — בעיקר הסעיף על קיבוץ הניווט (חי=סעיף 11, סנדבוקס=סעיף 9).',
        'עיין גם ב-RESPONSIBILITIES.md ו-git log כדי להבין את ההיסטוריה.',
        '',
        '## 3. עקרונות עבודה — חובה לשמור',
        '- שיטת אחריות (SoC): כל פיצ\'ר = תיקייה/CSS/namespace משלו. שינוי בנושא אחד לא נוגע בקוד של נושא אחר.',
        '- מקור-האמת לקבוצות הניווט: js/features/navmode/index.js (window.NavMode). להוסיף/לשנות קבוצה = לערוך GROUPS שם + לסמן group:\'<id>\' ב-SECTIONS שב-app.js. זהו.',
        '- האתר החי כולל תוספות עצמאיות שאסור לגעת בהן: Wyckoff, מפת טיולים (tripmap), pdf-book-translator.',
        '- אסור לדרוס נתוני ענן (Firestore). קוד שונה מנתונים. מיזוג הוא additive-only.',
        '- פריסה לחי נעשית כירורגית בלבד — עריכות נקודתיות לתוך קבצי החי הקיימים, לא robocopy/העתקה גורפת (כי החי והסנדבוקס diverged).',
        '- פיתוח מקומי בלבד עד אישור מפורש לפרוס לחי.',
        '',
        '## 4. מוסכמות טכניות',
        '- Vanilla JS, ללא build. מודולי IIFE שחושפים window.<Namespace>.',
        '- cache-busting ידני: ?v=N לכל קובץ ב-index.html — חובה להעלות גרסה בכל שינוי קובץ.',
        '- הודעות קומיט: ASCII בלבד (בלי עברית/מירכאות כפולות — שובר git). להשתמש ב-git commit -F file. לחתום: Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>.',
        '- בקומיט: לעשות git add של נתיבים מפורשים בלבד (לא git add -A) — כדי לא לתפוס עבודה לא-קשורה בתהליך.',
        '- Service Worker (sw.js) עלול להגיש קאש ישן — אם שינוי "לא נראה", רענון קשיח Ctrl+Shift+R.',
        '',
        'המשימה שלי: [כתוב כאן מה אתה רוצה לשנות]'
      ].join('\n')
    }
  ];

  // זריעה חד-פעמית למכשיר: מוסיף את פרומטי ה-SEED שחסרים (לפי id), פעם אחת.
  // מזהה קבוע + מיזוג by-id מבטיחים שלא ייווצרו כפילויות בין מכשירים.
  function ensureSeeded() {
    try {
      if (localStorage.getItem(SEED_FLAG) === '1') return;
      var cur = Store.get('prompts') || [];
      var ids = cur.map(function (x) { return x.id; });
      var add = SEED.filter(function (s) { return ids.indexOf(s.id) === -1; });
      if (add.length) Store.set('prompts', add.concat(cur));
      localStorage.setItem(SEED_FLAG, '1');
    } catch (e) {}
  }

  function prompts() { return (Store.get('prompts') || []).slice(); }
  function savePrompts(list) { Store.set('prompts', list); }

  function copyText(text) {
    function ok() { if (App.toast) App.toast('הפרומט הועתק ✓'); }
    function fail() { if (App.toast) App.toast('ההעתקה נכשלה — בחר ידנית והעתק'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok, fail);
    } else {
      try {
        var tmp = document.createElement('textarea');
        tmp.value = text; document.body.appendChild(tmp); tmp.select();
        document.execCommand('copy'); document.body.removeChild(tmp); ok();
      } catch (e) { fail(); }
    }
  }

  function render(root) {
    ensureSeeded();
    var state = { formOpen: false, editingId: null, query: '' };

    function rerender() { root.innerHTML = ''; root.append(build()); }

    function build() {
      var all = prompts();
      var items = all.map(function (p) { return buildItem(p); });  // כולם סגורים כברירת מחדל

      var list = el('div', { class: 'prompts-list' }, items);
      var emptyAll = el('div', { class: 'prompts-empty' + (all.length ? ' hidden' : '') }, 'אין עדיין פרומטים — לחץ "➕ הוסף פרומט" כדי להתחיל.');
      var emptySearch = el('div', { class: 'prompts-empty hidden' }, 'לא נמצאו פרומטים תואמים.');

      function applyFilter() {
        var q = state.query.trim().toLowerCase();
        var shown = 0;
        items.forEach(function (it) { var ok = it._match(q); it.classList.toggle('hidden', !ok); if (ok) shown++; });
        emptySearch.classList.toggle('hidden', !(all.length && shown === 0));
      }

      var search = el('input', { type: 'search', placeholder: 'חיפוש לפי שם סקיל, שם פרומט או תוכן…' });
      search.value = state.query;
      search.addEventListener('input', function () { state.query = search.value; applyFilter(); });

      var addBtn = el('button', { class: 'btn btn-primary', onClick: function () { state.editingId = null; state.formOpen = true; rerender(); } }, '➕ הוסף פרומט');
      var openAll = el('button', { class: 'btn', onClick: function () { items.forEach(function (it) { if (!it.classList.contains('hidden')) it.classList.add('open'); }); } }, 'פתח הכל');
      var closeAll = el('button', { class: 'btn', onClick: function () { items.forEach(function (it) { it.classList.remove('open'); }); } }, 'כווץ הכל');

      var hero = el('div', { class: 'card' }, [
        el('div', { class: 'prompts-hero' }, [
          el('div', {}, [
            el('h2', {}, '📋 פרומטים'),
            el('p', {}, 'אוסף פרומטים לשימוש חוזר. לחץ על כותרת כדי לפתוח, "העתק" כדי להעתיק ללוח, "✏️" כדי לשנות שם/תוכן, או "➕ הוסף פרומט".')
          ]),
          el('span', { class: 'prompts-count' }, all.length === 1 ? 'פרומט אחד' : all.length + ' פרומטים')
        ]),
        el('div', { class: 'prompts-toolbar' }, [
          el('div', { class: 'prompts-search' }, [ search ]),
          el('div', { class: 'prompts-bulk' }, [ addBtn, openAll, closeAll ])
        ])
      ]);

      var wrap = el('div', { class: 'prompts-wrap' }, [ hero ]);
      if (state.formOpen) wrap.append(buildForm());
      wrap.append(list, emptyAll, emptySearch);
      setTimeout(applyFilter, 0);
      return wrap;
    }

    function buildForm() {
      var editing = state.editingId ? prompts().filter(function (x) { return x.id === state.editingId; })[0] : null;
      var skillIn = el('input', { type: 'text', placeholder: 'לדוגמה: קיבוץ הניווט · navmode' });
      var titleIn = el('input', { type: 'text', placeholder: 'שם קצר לפרומט' });
      var bodyIn = el('textarea', { placeholder: 'הדבק כאן את תוכן הפרומט…', spellcheck: 'false', dir: 'auto' });
      if (editing) { skillIn.value = editing.skill || ''; titleIn.value = editing.title || ''; bodyIn.value = editing.body || ''; }

      function save() {
        var skill = skillIn.value.trim(), title = titleIn.value.trim(), body = bodyIn.value;
        if (!title && !body.trim()) { if (App.toast) App.toast('צריך לפחות שם או תוכן'); return; }
        var list = prompts();
        if (editing) {
          list = list.map(function (x) { return x.id === editing.id ? { id: x.id, skill: skill, title: title || '(ללא שם)', body: body } : x; });
          if (App.toast) App.toast('הפרומט עודכן ✓');
        } else {
          list.unshift({ id: Store.uid(), skill: skill, title: title || '(ללא שם)', body: body });
          if (App.toast) App.toast('הפרומט נוסף ✓');
        }
        savePrompts(list);
        state.formOpen = false; state.editingId = null;
        rerender();
      }
      function cancel() { state.formOpen = false; state.editingId = null; rerender(); }
      function field(labelText, control) { return el('div', {}, [ el('label', {}, labelText), control ]); }

      return el('div', { class: 'prompt-form' }, [
        el('div', { class: 'prompt-form-title' }, editing ? '✏️ עריכת פרומט' : '➕ פרומט חדש'),
        field('שם הסקיל', skillIn),
        field('שם הפרומט', titleIn),
        field('תוכן הפרומט', bodyIn),
        el('div', { class: 'prompt-form-actions' }, [
          el('button', { class: 'btn btn-primary', onClick: save }, editing ? 'שמור שינויים' : 'שמור פרומט'),
          el('button', { class: 'btn', onClick: cancel }, 'ביטול')
        ])
      ]);
    }

    function buildItem(p) {
      var ta = el('textarea', { class: 'prompt-text', readonly: 'readonly', dir: 'auto', spellcheck: 'false' });
      ta.value = p.body;

      var actions = [
        el('button', { class: 'btn', onClick: function (e) { e.stopPropagation(); copyText(p.body); } }, '📋 העתק פרומט'),
        el('button', { class: 'btn btn-mini', onClick: function (e) { e.stopPropagation(); state.editingId = p.id; state.formOpen = true; rerender(); } }, '✏️ ערוך'),
        el('button', { class: 'btn btn-mini btn-danger', onClick: function (e) {
          e.stopPropagation();
          if (!confirm('למחוק את הפרומט "' + (p.title || '') + '"?')) return;
          savePrompts(prompts().filter(function (x) { return x.id !== p.id; }));
          if (App.toast) App.toast('הפרומט נמחק');
          rerender();
        } }, '🗑️ מחק')
      ];
      var body = el('div', { class: 'prompt-body' }, [
        el('div', { class: 'prompt-body-inner' }, [ ta, el('div', { class: 'prompt-body-actions' }, actions) ])
      ]);

      var caret = el('span', { class: 'prompt-caret' }, '▾');
      var skillTag = el('span', { class: 'tag' }); skillTag.textContent = p.skill || 'כללי';
      var titles = el('div', { class: 'prompt-titles' }, [
        el('div', { class: 'prompt-title' }, p.title || '(ללא שם)'),
        el('div', { class: 'prompt-skill' }, [ document.createTextNode('סקיל:'), skillTag ])
      ]);
      var topCopy = el('button', { class: 'btn prompt-copy', onClick: function (e) { e.stopPropagation(); copyText(p.body); } }, 'העתק');

      var item = el('div', { class: 'prompt-item' });   // סגור כברירת מחדל
      var head = el('button', { class: 'prompt-head', onClick: function () { item.classList.toggle('open'); } }, [ caret, titles, topCopy ]);
      item.append(head, body);
      item._match = function (q) {
        var hay = ((p.title || '') + ' ' + (p.skill || '') + ' ' + (p.body || '')).toLowerCase();
        return !q || hay.indexOf(q) !== -1;
      };
      return item;
    }

    rerender();
  }

  App.register('prompts', render);
})();
