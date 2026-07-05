(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // נווט שוק העבודה (P-51) — view 'jobnav'. מסך-בית עם 4 מסלולים (קו"ח /
  // חיפוש / ראיון / שכר-ומו"מ) + מדריך מובנה + שמירת פרומפטים מוכנים לעמוד
  // הפרומטים. פורט של הסקיל job-market-navat-haavoda. אפס מפתחות Store
  // (הקו"ח ב-localStorage משלו). מותר למחזר כיתות ds-* (docstudio.css).
  // ─────────────────────────────────────────────────────────────────────────
  const el = (t, a, k) => App.el(t, a || {}, k || []);
  const D = () => window.JOBNAV_DATA;

  function saveToPrompts(title, body) {
    const cur = Store.get('prompts') || [];
    Store.set('prompts', [{ id: Store.uid(), skill: '💼 נווט שוק העבודה', title, body }].concat(cur));
    App.toast('📋 נשמר בעמוד הפרומטים');
  }

  // ── מדריך הוראות הפעלה ───────────────────────────────────────────────────
  function openGuide() {
    document.getElementById('jn-guide')?.remove();
    const ov = el('div', { id: 'jn-guide', class: 'ds-guide-ov', onClick: e => { if (e.target === ov) ov.remove(); } });
    const panel = el('div', { class: 'ds-guide-panel' });
    panel.appendChild(el('div', { class: 'ds-guide-head' }, [el('b', {}, '📖 הוראות הפעלה — נווט שוק העבודה'), el('button', { class: 'ds-guide-x', onClick: () => ov.remove() }, '✕')]));
    const body = el('div', { class: 'ds-guide-body' });
    body.innerHTML =
      '<h3>מהחיפוש ועד החתימה — 4 מסלולים</h3>' +
      '<h4>📄 בונה קורות חיים</h4><ul>' +
      '<li>ממלאים טופס — ומקבלים קו"ח ב<b>פורמט הישראלי התקני</b>: עמוד אחד, סדר הפוך, בלי תמונה/גיל/מצב-משפחתי (נאכף בקוד, לפי חוק שוויון הזדמנויות).</li>' +
      '<li><b>הכלי לעולם לא ממציא</b>: שדה ריק → [---למלא---] בקו"ח. בהישגים — נסו מספרים (חסכתם? כמה? הגדלתם? באיזה אחוז?). זה מה שהופך קו"ח חלש לחזק.</li>' +
      '<li>תצוגה חיה = בדיוק מה שמיוצא. ייצוא ל-PDF (מומלץ לשליחה) או Word (לעריכה). יש גם מחולל מכתב מקדים וצ\'קליסט ATS.</li></ul>' +
      '<h4>🔎 תוכנית חיפוש</h4><ul><li>בוחרים תחום/רמה/אזור → מקבלים את הפלטפורמות הנכונות <b>לתחום שלכם</b> (לפי סדר עדיפות), קבוצות פייסבוק, חברות השמה, ולו"ז שבועי מובנה של שעה ביום.</li></ul>' +
      '<h4>🎤 הכנה לראיון</h4><ul><li>השאלות שכמעט תמיד שואלים + מה רוצים לשמוע, תשובה טובה ומה לא לעשות; 5 שאלות לשאול בחזרה; וטיפים לפני/במהלך/אחרי — כולל צ\'קליסט.</li></ul>' +
      '<h4>💰 שכר ומו"מ</h4><ul><li>בוחרים תחום → טבלת טווחי שכר 2026 לפי ותק, השוואה כנה למשכורת שהזנתם, כללי מו"מ, ו<b>מה אסור למעסיק לשאול בראיון</b> (זכויות).</li>' +
      '<li>⚠️ נתוני השכר הם טווחים ממוצעים מהשוק — לא הבטחה. תפקיד שלא מופיע בטבלה — הכלי אומר זאת בכנות במקום להמציא.</li></ul>' +
      '<div class="ds-guide-tip">💡 "💾 שמור בפרומטים" בכל מסלול שולח פרומפט מוכן לעמוד הפרומטים — משם אפשר להעתיק ולהמשיך איתי לשיחה מותאמת אישית.</div>';
    panel.appendChild(body); ov.appendChild(panel); document.body.appendChild(ov);
  }

  // ── מסלול חיפוש ──────────────────────────────────────────────────────────
  function trackSearch(root) {
    const P = D().PLATFORMS;
    const fieldSel = el('select', { class: 'ds-in' }, Object.keys(P.byField).map(f => el('option', { value: f }, f)));
    const out = el('div', {});
    function show() {
      const f = fieldSel.value;
      out.innerHTML = '';
      out.appendChild(el('h3', { class: 'jn-h' }, '🎯 הפלטפורמות בשבילך — ' + f + ' (לפי סדר עדיפות)'));
      out.appendChild(el('ol', { class: 'jn-ol' }, P.byField[f].map(p => el('li', {}, p))));
      out.appendChild(el('h3', { class: 'jn-h' }, '🌐 לוחות ורשתות עיקריים'));
      out.appendChild(el('div', { class: 'jn-cards' }, P.main.map(p => el('div', { class: 'jn-card' }, [
        el('b', {}, p.name + (p.url ? '  ' : '')), p.url ? el('span', { class: 'jn-url' }, p.url) : null,
        el('div', { class: 'jn-card-d' }, p.type), el('div', { class: 'jn-tip' }, '💡 ' + p.tip)]))));
      out.appendChild(el('h3', { class: 'jn-h' }, '📢 קבוצות פייסבוק מומלצות'));
      out.appendChild(el('div', { class: 'jn-chips' }, P.fbGroups.map(g => el('span', { class: 'jn-chip' }, g))));
      out.appendChild(el('h3', { class: 'jn-h' }, '🤝 חברות השמה'));
      out.appendChild(el('div', { class: 'jn-chips' }, P.agencies.map(a => el('span', { class: 'jn-chip' }, a[0] + ' · ' + a[1]))));
      out.appendChild(el('h3', { class: 'jn-h' }, '🗓️ לו"ז חיפוש שבועי — שעה ביום'));
      const tbl = el('table', { class: 'jn-tbl' }, [el('thead', {}, el('tr', {}, [el('th', {}, 'יום'), el('th', {}, 'מה לעשות')]))]
        .concat(el('tbody', {}, P.weeklySchedule.map(w => el('tr', {}, [el('td', {}, w[0]), el('td', {}, w[1])])))));
      out.appendChild(el('div', { class: 'jn-tbl-wrap' }, [tbl]));
      out.appendChild(el('div', { class: 'jn-tip jn-tip-lg' }, '💡 ' + P.scheduleTip));
    }
    fieldSel.addEventListener('change', show);
    root.appendChild(el('div', { class: 'ds-field', style: { maxWidth: '360px' } }, [el('label', { class: 'ds-label' }, 'מה התחום שלך?'), fieldSel]));
    root.appendChild(out);
    root.appendChild(el('button', { class: 'btn btn-ghost', style: { marginTop: '14px' }, onClick: () => saveToPrompts('רוצה לשנות כיוון — עזור לי', D().PROMPTS[3].body) }, '💾 שמור פרומפט "שינוי כיוון" בפרומטים'));
    show();
  }

  // ── מסלול ראיון ──────────────────────────────────────────────────────────
  function trackInterview(root) {
    const I = D().INTERVIEW;
    root.appendChild(el('h3', { class: 'jn-h' }, '🎤 שאלות שכמעט תמיד שואלים'));
    I.questions.forEach(q => {
      root.appendChild(el('div', { class: 'jn-qa' }, [
        el('div', { class: 'jn-qa-q' }, '❓ ' + q.q),
        el('div', {}, [el('b', {}, 'מה רוצים לשמוע: '), q.want]),
        el('div', { class: 'jn-good' }, [el('b', {}, '✓ תשובה טובה: '), q.good]),
        el('div', { class: 'jn-bad' }, [el('b', {}, '✗ לא לעשות: '), q.bad])
      ]));
    });
    root.appendChild(el('h3', { class: 'jn-h' }, '🙋 5 שאלות לשאול את המראיין'));
    root.appendChild(el('ol', { class: 'jn-ol' }, I.askBack.map(q => el('li', {}, q))));
    root.appendChild(el('h3', { class: 'jn-h' }, '✅ צ׳קליסט — סמן תוך כדי ההכנה'));
    const cats = [['לפני הראיון', I.tips.before], ['בראיון', I.tips.during], ['אחרי הראיון', I.tips.after]];
    cats.forEach(([label, arr]) => {
      root.appendChild(el('div', { class: 'jn-check-cat' }, label));
      arr.forEach(t => root.appendChild(el('label', { class: 'jn-ats-row' }, [el('input', { type: 'checkbox' }), el('span', {}, t)])));
    });
    root.appendChild(el('button', { class: 'btn btn-ghost', style: { marginTop: '14px' }, onClick: () => saveToPrompts('יש לי ראיון — תכין אותי', D().PROMPTS[1].body) }, '💾 שמור פרומפט "הכנה לראיון" בפרומטים'));
  }

  // ── מסלול שכר ומו"מ ──────────────────────────────────────────────────────
  function trackSalary(root) {
    const S = D().SALARY, N = D().NEGOTIATION, R = D().RIGHTS;
    const fieldSel = el('select', { class: 'ds-in' }, S.fields.map((f, i) => el('option', { value: i }, f.name)));
    const salInput = el('input', { class: 'ds-in', type: 'number', placeholder: 'המשכורת שלך היום (₪) — רשות' });
    const out = el('div', {});
    function show() {
      const f = S.fields[+fieldSel.value];
      const levels = f.levels || S.levels;
      out.innerHTML = '';
      const tbl = el('table', { class: 'jn-tbl jn-salary' }, [el('thead', {}, el('tr', {}, [el('th', {}, 'תפקיד')].concat(levels.map(l => el('th', {}, l)))))]
        .concat(el('tbody', {}, f.roles.map(r => el('tr', {}, [el('td', {}, r.role)].concat(r.r.map(v => el('td', { class: 'jn-num' }, v))))))));
      out.appendChild(el('div', { class: 'jn-tbl-wrap' }, [tbl]));
      if (f.notes) out.appendChild(el('div', { class: 'jn-tip' }, '💡 ' + f.notes.join(' · ')));
      out.appendChild(el('div', { class: 'jn-genstats' }, S.general.map(g => el('span', { class: 'jn-chip' }, g[0] + ': ' + g[1]))));
      out.appendChild(el('div', { class: 'jn-disclaimer' }, '⚠️ ' + S.disclaimer + ' תפקיד שלא בטבלה — אין לי עליו נתון מדויק; היעזר בטווח של תפקיד דומה כהערכה בלבד.'));
    }
    fieldSel.addEventListener('change', show);
    salInput.addEventListener('input', () => { /* השוואה כנה — המשתמש משווה מול הטבלה, בלי המצאת נתון */ });
    root.appendChild(el('div', { class: 'jn-grid2', style: { maxWidth: '540px' } }, [
      el('div', { class: 'ds-field' }, [el('label', { class: 'ds-label' }, 'מה התחום?'), fieldSel]),
      el('div', { class: 'ds-field' }, [el('label', { class: 'ds-label' }, 'המשכורת הנוכחית שלך'), salInput])
    ]));
    root.appendChild(el('div', { class: 'jn-tip jn-tip-lg' }, 'מצא את התפקיד והוותק שלך בטבלה, והשווה למשכורת שהזנת. מעל הטווח — עמדת פתיחה טובה למו"מ; מתחת — יש לך מקום לבקש.'));
    root.appendChild(out);

    root.appendChild(el('h3', { class: 'jn-h' }, '💬 כללי הזהב של מו"מ שכר'));
    [['מתי לדבר על שכר?', N.when], ['איך לענות על "כמה אתה מבקש?"', N.howToAnswer], ['קיבלתי הצעה — מה עכשיו?', N.gotOffer], ['על מה עוד אפשר לנהל מו"מ (מלבד שכר)?', N.negotiable]]
      .forEach(([h, arr]) => { root.appendChild(el('div', { class: 'jn-neg-h' }, h)); root.appendChild(el('ul', { class: 'jn-ul' }, arr.map(x => el('li', {}, x)))); });

    root.appendChild(el('h3', { class: 'jn-h' }, '⚖️ מה אסור למעסיק לשאול בראיון (חוק שוויון הזדמנויות)'));
    root.appendChild(el('div', { class: 'jn-chips' }, R.forbidden.map(x => el('span', { class: 'jn-chip jn-chip-red' }, '✗ ' + x))));
    root.appendChild(el('div', { class: 'jn-tip' }, 'מותר לשאול: ' + R.allowed.join(' · ')));

    root.appendChild(el('button', { class: 'btn btn-ghost', style: { marginTop: '14px' }, onClick: () => saveToPrompts('כמה שווה המשכורת שלי?', D().PROMPTS[2].body) }, '💾 שמור פרומפט "בדיקת שכר" בפרומטים'));
    show();
  }

  const TRACKS = [
    { id: 'cv', icon: '📄', title: 'בונה קורות חיים', desc: 'קו"ח בפורמט ישראלי — עמוד אחד, תצוגה חיה, ייצוא PDF/Word + מכתב מקדים', render: r => window.JobNavCV.render(r) },
    { id: 'search', icon: '🔎', title: 'תוכנית חיפוש', desc: 'הפלטפורמות הנכונות לתחום שלך + לו"ז שבועי מובנה', render: trackSearch },
    { id: 'interview', icon: '🎤', title: 'הכנה לראיון', desc: 'שאלות נפוצות, תשובות מומלצות, ומה לשאול בחזרה', render: trackInterview },
    { id: 'salary', icon: '💰', title: 'שכר ומו"מ', desc: 'טווחי שכר 2026, כללי מו"מ, וזכויות בראיון', render: trackSalary }
  ];

  function renderTrack(root, t) {
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'card' }, [
      el('div', { class: 'ds-edit-head' }, [
        el('button', { class: 'btn btn-sm', onClick: () => renderHome(root) }, '→ חזרה למסלולים'),
        el('b', { class: 'ds-edit-title' }, t.icon + ' ' + t.title),
        el('div', { class: 'ds-edit-opts' }, [el('button', { class: 'btn btn-sm', onClick: openGuide }, '📖 הוראות')])
      ]),
      (() => { const c = el('div', { class: 'jn-track' }); t.render(c); return c; })()
    ]));
  }

  function renderHome(root) {
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'card ds-home' }, [
      el('div', { class: 'ds-home-head' }, [
        el('div', {}, [el('h2', {}, '💼 נווט שוק העבודה'),
          el('p', { class: 'ds-home-sub' }, 'מהחיפוש ועד החתימה — קורות חיים בפורמט ישראלי, תוכנית חיפוש, הכנה לראיון, ושכר ומו"מ. הכל רץ במחשב שלך.')]),
        el('button', { class: 'btn', onClick: openGuide }, '📖 הוראות הפעלה')
      ]),
      el('div', { class: 'ds-grid' }, TRACKS.map(t => el('button', { class: 'ds-card', onClick: () => renderTrack(root, t) }, [
        el('span', { class: 'ds-card-ic' }, t.icon), el('b', {}, t.title), el('span', { class: 'ds-card-d' }, t.desc)])))
    ]));
  }

  App.register('jobnav', root => renderHome(root));
  window.JobNav = { openGuide };
})();
