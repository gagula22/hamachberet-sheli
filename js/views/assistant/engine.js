(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // העוזר החכם — מנוע חיפוש/מענה מקומי (אחריות עצמאית).
  // 100% בדפדפן: קורא נתונים דרך Store.get בלבד (אף פעם לא כותב, אף פעם לא רשת).
  //   • tokenize  — טוקנייזר ידידותי-עברית (ניקוד/פיסוק מוסרים, אות סופית מנורמלת)
  //   • index     — בונה מסמכים מכל מקורות הנתונים (הערות/מחברת/משימות/תקציב/…)
  //   • search    — דירוג לפי חפיפת מילות-מפתח (כותרת במשקל גבוה)
  //   • computed  — תשובות מחושבות (כמה הוצאתי החודש, משימות פתוחות, מים היום…)
  //   • answer    — מתזמר: מחושב → ידע-עזרה → חיפוש-תוכן
  // ─────────────────────────────────────────────────────────────────────────

  var FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
  var STOP = { 'של': 1, 'את': 1, 'על': 1, 'אני': 1, 'מה': 1, 'יש': 1, 'לי': 1, 'הוא': 1, 'היא': 1, 'זה': 1, 'או': 1, 'גם': 1, 'כי': 1, 'אם': 1, 'לא': 1, 'כן': 1, 'הם': 1, 'אבל': 1, 'עם': 1, 'איך': 1, 'כמה': 1, 'מתי': 1, 'איפה': 1, 'למה': 1, 'את': 1, 'הזה': 1, 'הכי': 1, 'כל': 1 };

  function normWord(w) {
    w = String(w).toLowerCase();
    w = w.replace(/[֑-ׇ]/g, '');                 // ניקוד עברי
    w = w.replace(/[^0-9a-zא-ת]/g, '');           // רק אותיות/ספרות
    w = w.replace(/[ךםןףץ]/g, function (c) { return FINALS[c]; });
    return w;
  }
  function tokenize(str) {
    if (!str) return [];
    return String(str).split(/\s+/).map(normWord).filter(function (t) { return t.length >= 2; });
  }
  function stripHtml(html) {
    if (!html) return '';
    var d = document.createElement('div');
    d.innerHTML = html;
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  }
  function snippet(s, n) { s = s || ''; return s.length > (n || 90) ? s.slice(0, n || 90) + '…' : s; }
  // הטיות עבריות (סריקה/סריקת, ייצוא/לייצא…): תחילית משותפת של 4+ אותיות נחשבת התאמה
  function sharesPrefix(a, b) {
    var m = Math.min(a.length, b.length), n = 0;
    while (n < m && a.charAt(n) === b.charAt(n)) n++;
    return n >= 4;
  }
  // הסרת אות-שימוש מובילה (ו/ב/ל/כ/מ/ה/ש) ממילים ארוכות מספיק: "לסריקת"→"סריקת"
  function stripPref(w) {
    return w.length >= 4 && 'ובלכמהש'.indexOf(w.charAt(0)) > -1 ? w.slice(1) : w;
  }

  // ── אינדוקס תוכן ─────────────────────────────────────────────────────────
  function buildDocs() {
    var docs = [];
    (Store.get('notes') || []).forEach(function (n) {
      docs.push({ kind: 'note', icon: '📝', title: n.title || '(הערה ללא כותרת)', body: stripHtml(n.body), route: '#/notes', open: { k: 'openNoteId', id: n.id }, date: n.updatedAt });
    });
    (Store.get('topics') || []).forEach(function (t) {
      docs.push({ kind: 'topic', icon: '📓', title: t.name || '(נושא)', body: stripHtml(t.body), route: '#/notebook' });
    });
    (Store.get('todos') || []).forEach(function (t) {
      docs.push({ kind: 'todo', icon: t.done ? '☑️' : '✅', title: t.text || '', body: '', route: '#/todos', meta: t.done ? 'בוצעה' : 'פתוחה' });
    });
    (Store.get('goals') || []).forEach(function (g) {
      docs.push({ kind: 'goal', icon: '🎯', title: g.text || '', body: g.category || '', route: '#/goals', meta: g.category || '' });
    });
    (Store.get('transactions') || []).forEach(function (t) {
      docs.push({ kind: 'tx', icon: t.type === 'inc' ? '💰' : '💸', title: t.note || t.category || '', body: t.category || '', route: '#/budget', meta: (t.type === 'inc' ? '+' : '−') + '₪' + (t.amount || 0) + ' · ' + (t.date || '') });
    });
    (Store.get('habits') || []).forEach(function (h) {
      docs.push({ kind: 'habit', icon: '🌱', title: h.name || '', body: '', route: '#/habits' });
    });
    return docs;
  }

  var _docs = null;
  function index() { _docs = buildDocs(); return _docs; }
  function docs() { return _docs || index(); }
  if (window.Store && Store.subscribe) { Store.subscribe(function () { _docs = null; }); }

  function scoreDoc(qtokens, doc) {
    var tt = tokenize(doc.title), bt = tokenize(doc.body);
    var score = 0;
    qtokens.forEach(function (q) {
      if (STOP[q]) return;
      tt.forEach(function (t) {
        var ts = stripPref(t), qs = stripPref(q);
        if (t === q || ts === qs) score += 3;
        else if (t.indexOf(q) > -1 || q.indexOf(t) > -1) score += 1.4;
        else if (sharesPrefix(ts, qs)) score += 1;
      });
      bt.forEach(function (t) {
        if (t === q) score += 1;
        else if (t.indexOf(q) > -1) score += 0.4;
      });
    });
    return score;
  }
  function searchContent(query, limit) {
    var qt = tokenize(query).filter(function (t) { return !STOP[t]; });
    if (!qt.length) return [];
    return docs().map(function (d) { return { doc: d, score: scoreDoc(qt, d) }; })
      .filter(function (x) { return x.score > 0; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, limit || 6)
      .map(function (x) {
        var d = x.doc;
        return { icon: d.icon, title: d.title || '(ללא כותרת)', sub: d.meta || snippet(d.body), route: d.route, open: d.open };
      });
  }

  // ── ידע-עזרה ─────────────────────────────────────────────────────────────
  function searchHelp(query) {
    var qt = tokenize(query);
    var list = window.AsstKnowledge || [];
    return list.map(function (h) {
      var hk = tokenize(h.keys + ' ' + h.q);
      var hb = tokenize(h.a + ' ' + (h.where || ''));
      var score = 0;
      qt.forEach(function (q) {
        if (STOP[q]) return;
        hk.forEach(function (t) {
          var ts = stripPref(t), qs = stripPref(q);
          if (t === q || ts === qs) score += 3;
          else if (t.indexOf(q) > -1 || q.indexOf(t) > -1) score += 1.2;
          else if (sharesPrefix(ts, qs)) score += 1.5;
        });
        hb.forEach(function (t) { if (t === q) score += 0.6; });
      });
      return { help: h, score: score };
    }).filter(function (x) { return x.score > 0; })
      .sort(function (a, b) { return b.score - a.score; })
      .map(function (x) { return x.help; });
  }

  // ── תשובות מחושבות ───────────────────────────────────────────────────────
  function thisMonth() { return new Date().toISOString().slice(0, 7); }
  function ils(n) { return '₪' + (Math.round(n * 100) / 100).toFixed(2); }

  function computed(query) {
    var qt = tokenize(query);
    var has = function () {
      for (var i = 0; i < arguments.length; i++) {
        var a = normWord(arguments[i]);
        for (var j = 0; j < qt.length; j++) { if (qt[j] === a || qt[j].indexOf(a) > -1 || a.indexOf(qt[j]) > -1) return true; }
      }
      return false;
    };
    var openBudget = [{ icon: '💰', title: 'פתח תקציב', route: '#/budget' }];

    // הוצאות החודש
    if (has('הוצאות', 'הוצאתי', 'הוצאה') && !has('הכנסה', 'הכנסות')) {
      var ex = (Store.get('transactions') || []).filter(function (t) { return (t.date || '').indexOf(thisMonth()) === 0 && t.type === 'exp'; });
      var sx = ex.reduce(function (s, t) { return s + (t.amount || 0); }, 0);
      return { text: 'סך ההוצאות שלך החודש: ' + ils(sx) + ' ב-' + ex.length + ' תנועות.', results: openBudget };
    }
    // הכנסות החודש
    if (has('הכנסה', 'הכנסות', 'הרווחתי')) {
      var inc = (Store.get('transactions') || []).filter(function (t) { return (t.date || '').indexOf(thisMonth()) === 0 && t.type === 'inc'; });
      var si = inc.reduce(function (s, t) { return s + (t.amount || 0); }, 0);
      return { text: 'סך ההכנסות שלך החודש: ' + ils(si) + ' ב-' + inc.length + ' תנועות.', results: openBudget };
    }
    // יתרה / מאזן
    if (has('יתרה', 'מאזן', 'נשאר', 'חיסכון')) {
      var tx = (Store.get('transactions') || []).filter(function (t) { return (t.date || '').indexOf(thisMonth()) === 0; });
      var income = tx.filter(function (t) { return t.type === 'inc'; }).reduce(function (s, t) { return s + (t.amount || 0); }, 0);
      var expense = tx.filter(function (t) { return t.type === 'exp'; }).reduce(function (s, t) { return s + (t.amount || 0); }, 0);
      var net = income - expense;
      return { text: 'היתרה החודשית: ' + (net >= 0 ? '+' : '−') + ils(Math.abs(net)) + ' (הכנסות ' + ils(income) + ' פחות הוצאות ' + ils(expense) + ').', results: openBudget };
    }
    // משימות פתוחות
    if (has('משימות', 'משימה', 'todo') && (has('פתוחות', 'פתוח', 'נשארו', 'לעשות') || true)) {
      var todos = Store.get('todos') || [];
      var open = todos.filter(function (t) { return !t.done; });
      if (has('בוצעו', 'הושלמו', 'סיימתי')) {
        var done = todos.filter(function (t) { return t.done; });
        return { text: 'השלמת ' + done.length + ' משימות מתוך ' + todos.length + '.', results: done.slice(0, 6).map(function (t) { return { icon: '☑️', title: t.text, route: '#/todos' }; }) };
      }
      return { text: 'יש לך ' + open.length + ' משימות פתוחות (מתוך ' + todos.length + ').', results: open.slice(0, 6).map(function (t) { return { icon: '✅', title: t.text, route: '#/todos' }; }) };
    }
    // מים היום
    if (has('מים', 'כוסות', 'שתיתי', 'שתייה')) {
      var w = (Store.get('water') || {})[Store.todayKey()] || 0;
      return { text: 'שתית היום ' + w + ' מתוך 8 כוסות מים.', results: [{ icon: '💧', title: 'פתח שתייה ושינה', route: '#/water' }] };
    }
    // הרגלים היום
    if (has('הרגלים', 'הרגל')) {
      var habits = Store.get('habits') || [];
      var today = Store.todayKey();
      var done = habits.filter(function (h) { return h.log && h.log[today]; }).length;
      return { text: 'היום סימנת ' + done + ' מתוך ' + habits.length + ' הרגלים.', results: [{ icon: '🌱', title: 'פתח מעקב הרגלים', route: '#/habits' }] };
    }
    // מצב רוח היום
    if (has('מצברוח', 'מצב', 'רוח', 'הרגשה')) {
      var m = (Store.get('mood') || {})[Store.todayKey()];
      return { text: m ? ('מצב הרוח שתיעדת היום: ' + m + ' מתוך 5.') : 'עוד לא תיעדת מצב רוח היום.', results: [{ icon: '💭', title: 'פתח יומן מצב רוח', route: '#/mood' }] };
    }
    // מטרות
    if (has('מטרות', 'מטרה', 'יעד', 'יעדים')) {
      var goals = Store.get('goals') || [];
      var openG = goals.filter(function (g) { return !g.done; });
      return { text: 'יש לך ' + openG.length + ' מטרות פתוחות (מתוך ' + goals.length + ').', results: openG.slice(0, 6).map(function (g) { return { icon: '🎯', title: g.text, route: '#/goals' }; }) };
    }
    return null;
  }

  // ── סקירת פיצ׳רים ("מה יש באתר") ─────────────────────────────────────────
  function overview() {
    var byCat = {};
    (window.AsstKnowledge || []).forEach(function (h) {
      var c = h.cat || 'כללי';
      if (!byCat[c]) byCat[c] = h;
    });
    var nav = [
      { icon: '🏠', title: 'לוח בקרה — סיכום יומי + "ביום הזה לפני…"', route: '#/dashboard' },
      { icon: '📓', title: 'מחברת — עורך עשיר, קישורים-חוזרים, תגיות וייצוא', route: '#/notebook' },
      { icon: '🕸️', title: 'מפת קשרים — כל הנושאים והקישורים', route: '#/graph' },
      { icon: '🖍️', title: 'מרכז הדגשות — כל מה שסימנת במרקר', route: '#/highlights' },
      { icon: '📅', title: 'יומן — תכנון יומי / שבועי / חודשי', route: '#/calendar' },
      { icon: '🧭', title: 'סקירה שבועית מודרכת', route: '#/weekly-review' },
      { icon: '📝', title: 'הערות מהירות עם תמונות', route: '#/notes' },
      { icon: '✅', title: 'משימות', route: '#/todos' },
      { icon: '🎯', title: 'מטריצת סדר יום (אייזנהאואר)', route: '#/eisenhower' },
      { icon: '🌱', title: 'מעקב הרגלים עם רצפים', route: '#/habits' },
      { icon: '💭', title: 'יומן מצב רוח (30 ימים)', route: '#/mood' },
      { icon: '💧', title: 'שתייה ושינה', route: '#/water' },
      { icon: '💰', title: 'תקציב — הכנסות, הוצאות ויתרה', route: '#/budget' },
      { icon: '🏁', title: 'מטרות לפי קטגוריות', route: '#/goals' },
      { icon: '📊', title: 'תובנות — גרפים ומגמות מהנתונים', route: '#/insights' },
      { icon: '🎙️', title: 'הערות קול + תמלול ל-Word', route: '#/voice' },
      { icon: '✏️', title: 'לוח שרטוט — ציור חופשי למחברת', route: '#/sketch' },
      { icon: '🧠', title: 'כרטיסיות זיכרון (חזרה מרווחת)', route: '#/flashcards' },
      { icon: '🔖', title: 'רשימת קריאה', route: '#/readinglist' },
      { icon: '🛠️', title: '15 כלים מקומיים (PDF/Word/OCR/סריקה/תמלול)', route: '#/stickers' },
      { icon: '⚙️', title: 'הגדרות — מצב כהה, גודל טקסט וגיבוי אוטומטי', route: '#/settings' }
    ];
    return {
      text: 'באתר 22 מסכים, וכולם עובדים מקומית בדפדפן. אפשר לשאול אותי על כל אחד — "מה זה…", "איפה…" או "איך…". בנוסף: חיפוש מהיר עם Ctrl+K, גיבוי אוטומטי יומי, מצב כהה, וקיצורי מקלדת בעורך. הנה המסכים:',
      results: nav
    };
  }

  // ── מתזמר ─────────────────────────────────────────────────────────────────
  function toHelpResults(list) {
    return list.slice(0, 3).map(function (h) { return { icon: '💡', title: h.q, sub: 'פתח את המסך', route: h.route }; });
  }
  function helpAnswer(h, whereIntent, extra) {
    var text = whereIntent && h.where ? ('📍 ' + h.where + '\n\n' + h.a) : h.a;
    var results = [{ icon: '↗️', title: 'קח אותי לשם', route: h.route }].concat(extra || []);
    return { kind: 'help', text: text, results: results };
  }
  function answer(query) {
    query = (query || '').trim();
    if (!query) return { kind: 'none', text: 'שאל אותי משהו על האתר או על התוכן שלך.', results: [] };

    // סקירה כללית — "מה יש באתר", "מה אתה יודע", "עזרה"
    if (/מה יש באתר|מה אתה יודע|מה אפשר לעשות|מה אפשר באתר|אילו פיצ|מה הפיצ|כל הפיצ|רשימת פיצ|מה האתר (יודע|עושה|כולל)|^עזרה$|תן לי סקירה|מה יש פה|מה יש כאן/.test(query)) {
      var ov = overview();
      return { kind: 'overview', text: ov.text, results: ov.results };
    }

    var howto = /איך|כיצד|להוסיף|להוריד|למחוק|לייצא|לתרגם|אפשר|מה זה|מה עושה|מה ההבדל|למה משמש|היכן|איפה|כותב|עובד/.test(query);
    var whereIntent = /איפה|היכן|לאן|איך מגיעים|איך מוצאים|באיזה מסך|באיזה מקום/.test(query);
    // "איפה כתבתי/רשמתי…" = שאלת תוכן אישי, לא שאלת עזרה
    var contenty = /כתבתי|רשמתי|שמרתי|תיעדתי|הוספתי|קניתי|שילמתי/.test(query);

    // שאלות "איך עושים" מקבלות ידע-עזרה לפני תשובה מחושבת על הנתונים.
    if (!howto) {
      var c = computed(query);
      if (c) return { kind: 'computed', text: c.text, results: c.results || [] };
    }

    var help = searchHelp(query);
    var content = searchContent(query, 6);

    // שאלת תוכן אישי מנצחת עזרה ("איפה כתבתי על…")
    if (contenty) {
      if (content.length) return { kind: 'content', text: 'מצאתי ' + content.length + ' תוצאות בתוכן שלך:', results: content };
      return { kind: 'none', text: 'חיפשתי בכל התוכן שלך (הערות, מחברת, משימות, תקציב, מטרות) ולא מצאתי התאמה. נסה ניסוח אחר או מילה אחרת.', results: [] };
    }
    if (help.length && (howto || !content.length)) {
      var extra = help.length > 1 ? toHelpResults(help.slice(1)) : [];
      return helpAnswer(help[0], whereIntent, extra);
    }
    if (content.length) {
      return { kind: 'content', text: 'מצאתי ' + content.length + ' תוצאות בתוכן שלך:', results: content };
    }
    if (help.length) {
      return helpAnswer(help[0], whereIntent, toHelpResults(help.slice(1)));
    }
    // ניסיון אחרון: גם בשאלת "איך", אם יש מענה מחושב רלוונטי — החזר אותו.
    var cFallback = computed(query);
    if (cFallback) return { kind: 'computed', text: cFallback.text, results: cFallback.results || [] };
    return { kind: 'none', text: 'לא מצאתי תשובה מדויקת. נסה מילות-מפתח כמו: משימות, הוצאות, מחברת, ייצוא, הרגלים, מטרות, תרגום, תמלול — או שאל "מה יש באתר" לסקירה מלאה.', results: [] };
  }

  window.AsstEngine = { tokenize: tokenize, index: index, searchContent: searchContent, searchHelp: searchHelp, computed: computed, answer: answer };
})();
