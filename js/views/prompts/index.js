(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // עמוד "פרומטים" — אקורדיון מתקפל + הוספה ידנית.
  //   • BUILTIN  — פרומטים מובנים (קריאה בלבד), תמיד מוצגים.
  //   • משתמש    — נשמרים ב-Store('prompts') (subcol, מסונכרן/מגובה), עם
  //                הוספה/עריכה/מחיקה דרך הממשק. אפס שינוי בקוד להוספת פרומט.
  // כל פרומט: { id, skill, title, body }. מובנה מסומן builtin:true.
  // ─────────────────────────────────────────────────────────────────────────

  function el(t, a, k) { return App.el(t, a || {}, k || []); }

  var BUILTIN = [
    {
      id: 'builtin-onboarding-skill',
      builtin: true,
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

  function userPrompts() { return (Store.get('prompts') || []).slice(); }
  function saveUserPrompts(list) { Store.set('prompts', list); }

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
    var state = { formOpen: false, editingId: null, query: '' };

    function rerender() { root.innerHTML = ''; root.append(build()); }

    function build() {
      var all = BUILTIN.concat(userPrompts());
      var items = all.map(function (p, i) { return buildItem(p, i === 0); });

      var list = el('div', { class: 'prompts-list' }, items);
      var empty = el('div', { class: 'prompts-empty hidden' }, 'לא נמצאו פרומטים תואמים.');

      function applyFilter() {
        var q = state.query.trim().toLowerCase();
        var shown = 0;
        items.forEach(function (it) { var ok = it._match(q); it.classList.toggle('hidden', !ok); if (ok) shown++; });
        empty.classList.toggle('hidden', shown !== 0);
      }

      var search = el('input', { type: 'search', placeholder: 'חיפוש לפי שם סקיל, כותרת או תוכן…' });
      search.value = state.query;
      search.addEventListener('input', function () { state.query = search.value; applyFilter(); });

      var addBtn = el('button', { class: 'btn btn-primary', onClick: function () { state.editingId = null; state.formOpen = true; rerender(); } }, '➕ הוסף פרומט');
      var openAll = el('button', { class: 'btn', onClick: function () { items.forEach(function (it) { if (!it.classList.contains('hidden')) it.classList.add('open'); }); } }, 'פתח הכל');
      var closeAll = el('button', { class: 'btn', onClick: function () { items.forEach(function (it) { it.classList.remove('open'); }); } }, 'כווץ הכל');

      var hero = el('div', { class: 'card' }, [
        el('div', { class: 'prompts-hero' }, [
          el('div', {}, [
            el('h2', {}, '📋 פרומטים'),
            el('p', {}, 'אוסף פרומטים לשימוש חוזר. לחץ על כותרת כדי לפתוח, "העתק" כדי להעתיק ללוח, או "➕ הוסף פרומט" כדי להוסיף משלך.')
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
      wrap.append(list, empty);
      setTimeout(applyFilter, 0);
      return wrap;
    }

    function buildForm() {
      var editing = state.editingId ? userPrompts().filter(function (x) { return x.id === state.editingId; })[0] : null;
      var skillIn = el('input', { type: 'text', placeholder: 'לדוגמה: קיבוץ הניווט · navmode' });
      var titleIn = el('input', { type: 'text', placeholder: 'כותרת קצרה לפרומט' });
      var bodyIn = el('textarea', { placeholder: 'הדבק כאן את תוכן הפרומט…', spellcheck: 'false', dir: 'auto' });
      if (editing) { skillIn.value = editing.skill || ''; titleIn.value = editing.title || ''; bodyIn.value = editing.body || ''; }

      function save() {
        var skill = skillIn.value.trim(), title = titleIn.value.trim(), body = bodyIn.value;
        if (!title.trim() && !body.trim()) { if (App.toast) App.toast('צריך לפחות כותרת או תוכן'); return; }
        var list = userPrompts();
        if (editing) {
          list = list.map(function (x) { return x.id === editing.id ? { id: x.id, skill: skill, title: title || '(ללא כותרת)', body: body } : x; });
          if (App.toast) App.toast('הפרומט עודכן ✓');
        } else {
          list.unshift({ id: Store.uid(), skill: skill, title: title || '(ללא כותרת)', body: body });
          if (App.toast) App.toast('הפרומט נוסף ✓');
        }
        saveUserPrompts(list);
        state.formOpen = false; state.editingId = null;
        rerender();
      }
      function cancel() { state.formOpen = false; state.editingId = null; rerender(); }

      function field(labelText, control) {
        return el('div', {}, [ el('label', {}, labelText), control ]);
      }

      return el('div', { class: 'prompt-form' }, [
        el('div', { class: 'prompt-form-title' }, editing ? '✏️ עריכת פרומט' : '➕ פרומט חדש'),
        field('שם הסקיל', skillIn),
        field('כותרת', titleIn),
        field('תוכן הפרומט', bodyIn),
        el('div', { class: 'prompt-form-actions' }, [
          el('button', { class: 'btn btn-primary', onClick: save }, editing ? 'שמור שינויים' : 'שמור פרומט'),
          el('button', { class: 'btn', onClick: cancel }, 'ביטול')
        ])
      ]);
    }

    function buildItem(p, open) {
      var ta = el('textarea', { class: 'prompt-text', readonly: 'readonly', dir: 'auto', spellcheck: 'false' });
      ta.value = p.body;

      var actions = [ el('button', { class: 'btn', onClick: function (e) { e.stopPropagation(); copyText(p.body); } }, '📋 העתק פרומט') ];
      if (!p.builtin) {
        actions.push(el('button', { class: 'btn btn-mini', onClick: function (e) { e.stopPropagation(); state.editingId = p.id; state.formOpen = true; rerender(); } }, '✏️ ערוך'));
        actions.push(el('button', { class: 'btn btn-mini btn-danger', onClick: function (e) {
          e.stopPropagation();
          if (!confirm('למחוק את הפרומט "' + (p.title || '') + '"?')) return;
          saveUserPrompts(userPrompts().filter(function (x) { return x.id !== p.id; }));
          if (App.toast) App.toast('הפרומט נמחק');
          rerender();
        } }, '🗑️ מחק'));
      }
      var body = el('div', { class: 'prompt-body' }, [
        el('div', { class: 'prompt-body-inner' }, [ ta, el('div', { class: 'prompt-body-actions' }, actions) ])
      ]);

      var caret = el('span', { class: 'prompt-caret' }, '▾');
      var skillRow = [ document.createTextNode('סקיל:') ];
      var skillTag = el('span', { class: 'tag' }); skillTag.textContent = p.skill || 'כללי';
      skillRow.push(skillTag);
      if (p.builtin) { var b = el('span', { class: 'prompt-builtin-tag' }); b.textContent = 'מובנה'; skillRow.push(b); }
      var titles = el('div', { class: 'prompt-titles' }, [
        el('div', { class: 'prompt-title' }, p.title),
        el('div', { class: 'prompt-skill' }, skillRow)
      ]);
      var topCopy = el('button', { class: 'btn prompt-copy', onClick: function (e) { e.stopPropagation(); copyText(p.body); } }, 'העתק');

      var item = el('div', { class: 'prompt-item' + (open ? ' open' : '') });
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
