(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // עמוד "פרומטים" — אקורדיון מתקפל, מעוצב, מוכן לגדול. קריאה בלבד.
  // כל פרומט: { id, skill, title, body }. להוספת פרומט: עוד איבר ב-PROMPTS.
  // אפס נתונים אישיים, אפס תלות חיצונית, אפס שינוי סכימה/Store.
  // ─────────────────────────────────────────────────────────────────────────

  function el(t, a, k) { return App.el(t, a || {}, k || []); }

  var PROMPTS = [
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

  function buildItem(p, open) {
    var ta = el('textarea', { class: 'prompt-text', readonly: 'readonly', dir: 'auto', spellcheck: 'false' });
    ta.value = p.body;

    var bodyCopy = el('button', { class: 'btn', onClick: function (e) { e.stopPropagation(); copyText(p.body); } }, '📋 העתק פרומט');
    var body = el('div', { class: 'prompt-body' }, [
      el('div', { class: 'prompt-body-inner' }, [ ta, el('div', { class: 'prompt-body-actions' }, [ bodyCopy ]) ])
    ]);

    var caret = el('span', { class: 'prompt-caret' }, '▾');
    var skillTag = el('span', { class: 'tag' }); skillTag.textContent = p.skill || 'כללי';
    var titles = el('div', { class: 'prompt-titles' }, [
      el('div', { class: 'prompt-title' }, p.title),
      el('div', { class: 'prompt-skill' }, [ document.createTextNode('סקיל:'), skillTag ])
    ]);
    var topCopy = el('button', { class: 'btn prompt-copy', onClick: function (e) { e.stopPropagation(); copyText(p.body); } }, 'העתק');

    var item = el('div', { class: 'prompt-item' + (open ? ' open' : '') });
    var head = el('button', { class: 'prompt-head', onClick: function () { item.classList.toggle('open'); } }, [ caret, titles, topCopy ]);
    item.append(head, body);
    item._match = function (q) {
      var hay = (p.title + ' ' + (p.skill || '') + ' ' + p.body).toLowerCase();
      return !q || hay.indexOf(q) !== -1;
    };
    return item;
  }

  function render(root) {
    var items = PROMPTS.map(function (p, i) { return buildItem(p, i === 0); });
    var list = el('div', { class: 'prompts-list' }, items);
    var empty = el('div', { class: 'prompts-empty hidden' }, 'לא נמצאו פרומטים תואמים.');

    var search = el('input', { type: 'search', placeholder: 'חיפוש לפי שם סקיל, כותרת או תוכן…' });
    search.addEventListener('input', function () {
      var q = search.value.trim().toLowerCase();
      var shown = 0;
      items.forEach(function (it) { var ok = it._match(q); it.classList.toggle('hidden', !ok); if (ok) shown++; });
      empty.classList.toggle('hidden', shown !== 0);
    });

    var openAll = el('button', { class: 'btn', onClick: function () { items.forEach(function (it) { if (!it.classList.contains('hidden')) it.classList.add('open'); }); } }, 'פתח הכל');
    var closeAll = el('button', { class: 'btn', onClick: function () { items.forEach(function (it) { it.classList.remove('open'); }); } }, 'כווץ הכל');

    var hero = el('div', { class: 'card' }, [
      el('div', { class: 'prompts-hero' }, [
        el('div', {}, [
          el('h2', {}, [ document.createTextNode('📋 פרומטים') ]),
          el('p', {}, 'אוסף פרומטים לשימוש חוזר. לחץ על כותרת כדי לפתוח, או "העתק" כדי להעתיק ללוח ולהדביק בשיחה חדשה.')
        ]),
        el('span', { class: 'prompts-count' }, PROMPTS.length === 1 ? 'פרומט אחד' : PROMPTS.length + ' פרומטים')
      ]),
      el('div', { class: 'prompts-toolbar' }, [
        el('div', { class: 'prompts-search' }, [ search ]),
        el('div', { class: 'prompts-bulk' }, [ openAll, closeAll ])
      ])
    ]);

    root.append(el('div', { class: 'prompts-wrap' }, [ hero, list, empty ]));
  }

  App.register('prompts', render);
})();
