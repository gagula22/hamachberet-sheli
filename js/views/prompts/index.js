(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // עמוד "פרומטים" — אחריות עצמאית, קריאה בלבד. אוסף פרומטים לשימוש חוזר,
  // כל אחד עם כפתור העתקה ללוח. אפס נתונים אישיים, אפס תלות חיצונית, אפס Store.
  // להוספת פרומט חדש: עוד איבר במערך PROMPTS. אין שינוי בסכימה.
  // ─────────────────────────────────────────────────────────────────────────

  function el(t, a, k) { return App.el(t, a || {}, k || []); }

  var PROMPTS = [
    {
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

  function promptCard(p) {
    var ta = el('textarea', {
      readonly: 'readonly', dir: 'auto', spellcheck: 'false',
      style: {
        width: '100%', minHeight: '340px', resize: 'vertical',
        fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
        fontSize: '13px', lineHeight: '1.7', padding: '14px', marginTop: '12px',
        borderRadius: '14px', border: '1px solid var(--line)',
        background: 'var(--paper)', color: 'var(--ink)', whiteSpace: 'pre-wrap'
      }
    });
    ta.value = p.body;
    var copyBtn = el('button', { class: 'btn', onClick: function () { copyText(p.body); } }, '📋 העתק פרומט');
    return el('div', { class: 'card' }, [
      el('div', { class: 'row row-between' }, [ el('h3', {}, p.title), copyBtn ]),
      ta
    ]);
  }

  function render(root) {
    var head = el('div', { class: 'card' }, [
      el('h2', {}, '📋 פרומטים'),
      el('div', { style: { marginTop: '6px', color: 'var(--ink-soft)', fontSize: '14px' } },
        'פרומטים מוכנים לשימוש חוזר — לחץ "העתק פרומט" והדבק בשיחה חדשה עם הסוכן.')
    ]);
    root.append(el('div', { class: 'stack stack-lg' }, [head].concat(PROMPTS.map(promptCard))));
  }

  App.register('prompts', render);
})();
