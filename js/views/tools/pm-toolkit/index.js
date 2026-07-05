(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // ארגז PM — view 'pmkit' (P-47). פורט של אפליקציית PM-Toolkit: 8 מחוללי
  // פרומפטים מקצועיים לניהול מוצר (טופס → פרומפט מנוסח + צ'קליסט איכות),
  // מאגר מסגרות (RICE/JTBD/...) ותבניות מהירות. הנתונים ב-data.js (PMT_DATA).
  // סינרגיה מותרת: שמירת פרומפט ל-Store('prompts') באותה סכימה של עמוד
  // הפרומטים ({id,skill,title,body}, additive) — אפס שינוי סכימה.
  // ─────────────────────────────────────────────────────────────────────────
  const el = (t, a, k) => App.el(t, a || {}, k || []);
  const D = () => window.PMT_DATA;

  function copyText(text, btn) {
    const done = () => { const o = btn.textContent; btn.textContent = '✓ הועתק'; setTimeout(() => btn.textContent = o, 1500); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(() => fallback());
    else fallback();
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) {}
      ta.remove();
    }
  }

  function saveToPrompts(title, body) {
    const cur = Store.get('prompts') || [];
    Store.set('prompts', [{ id: Store.uid(), skill: '🧰 ארגז PM', title, body }].concat(cur));
    App.toast('📋 נשמר בעמוד הפרומטים');
  }

  function openGuide() {
    document.getElementById('pmk-guide')?.remove();
    const ov = el('div', { id: 'pmk-guide', class: 'ds-guide-ov', onClick: e => { if (e.target === ov) ov.remove(); } });
    const panel = el('div', { class: 'ds-guide-panel' });
    panel.appendChild(el('div', { class: 'ds-guide-head' }, [
      el('b', {}, '📖 הוראות הפעלה — ארגז PM'),
      el('button', { class: 'ds-guide-x', onClick: () => ov.remove() }, '✕')
    ]));
    const body = el('div', { class: 'ds-guide-body' });
    body.innerHTML = `<h3>איך ממצים את הארגז</h3>
      <h4>🧭 מה זה עושה</h4>
      <ul><li>כל כרטיס הוא <b>מחולל פרומפט מקצועי</b>: ממלאים טופס קצר — ומקבלים פרומפט מנוסח ברמת מנהל-מוצר בכיר, מוכן להדבקה אצל קלוד (בצ'אט הזה או בכל מקום).</li>
      <li>שדות שהשארת ריקים הופכים ל"נא לשאול אותי" — קלוד ישלים בשאלות הבהרה במקום להמציא.</li>
      <li>ה<b>צ'קליסט</b> שליד כל מחולל = בקרת איכות לתוצר שקלוד יחזיר: עברו סעיף-סעיף וודאו שכלום לא חסר.</li></ul>
      <h4>💡 טיפים</h4>
      <ul><li>"💾 שמור בפרומטים" שולח את הפרומפט לעמוד הפרומטים של האתר — מסונכרן לענן, זמין גם בטלפון.</li>
      <li>"מתי משתמשים" בכל כרטיס עוזר לבחור את המחולל הנכון — אל תכתבו PRD כשמה שצריך זה סיעור מוחות.</li>
      <li>לשונית <b>מסגרות</b>: RICE, MoSCoW, JTBD ועוד — הסבר מעשי מתי ואיך; לשונית <b>תבניות</b>: מבנים להעתקה מיידית (User Story, הצהרת בעיה...).</li></ul>`;
    panel.appendChild(body);
    ov.appendChild(panel); document.body.appendChild(ov);
  }

  function renderSkill(root, skill) {
    root.innerHTML = '';
    const vals = {};
    const out = el('textarea', { class: 'pmk-out', readonly: '', rows: '14' });
    const refresh = () => { out.value = skill.buildPrompt(vals); };

    const form = el('div', { class: 'ds-form' }, skill.fields.map(f => {
      const wrap = el('div', { class: 'ds-field' });
      wrap.appendChild(el('label', { class: 'ds-label' }, f.label + (f.required ? ' *' : '')));
      let inp;
      if (f.type === 'textarea') inp = el('textarea', { class: 'ds-in', rows: '3', placeholder: f.placeholder || '' });
      else if (f.type === 'select') inp = el('select', { class: 'ds-in' }, [el('option', { value: '' }, '— בחר —')].concat(f.options.map(o => el('option', { value: o }, o))));
      else inp = el('input', { class: 'ds-in', type: 'text', placeholder: f.placeholder || '' });
      inp.addEventListener('input', () => { vals[f.id] = inp.value; refresh(); });
      inp.addEventListener('change', () => { vals[f.id] = inp.value; refresh(); });
      wrap.appendChild(inp);
      return wrap;
    }));

    const copyBtn = el('button', { class: 'btn' }, '📋 העתק פרומפט');
    copyBtn.addEventListener('click', () => copyText(out.value, copyBtn));

    root.appendChild(el('div', { class: 'pmk-skill' }, [
      el('div', { class: 'ds-edit-head' }, [
        el('button', { class: 'btn btn-sm', onClick: () => renderHome(root) }, '→ חזרה לארגז'),
        el('b', { class: 'ds-edit-title' }, skill.icon + ' ' + skill.title),
        el('span', { class: 'pmk-cmd' }, skill.command),
        el('div', { class: 'ds-edit-opts' }, [el('button', { class: 'btn btn-sm', onClick: openGuide }, '📖 הוראות')])
      ]),
      el('div', { class: 'pmk-grid' }, [
        el('div', {}, [
          el('div', { class: 'pmk-when' }, [el('b', {}, 'מתי משתמשים: '), skill.when.join(' · ')]),
          form
        ]),
        el('div', {}, [
          el('div', { class: 'ds-label' }, 'הפרומפט שלך (מתעדכן חי) — הדבק אצל קלוד:'),
          out,
          el('div', { class: 'ds-export-bar' }, [
            copyBtn,
            el('button', { class: 'btn btn-ghost', onClick: () => saveToPrompts(skill.icon + ' ' + skill.title, out.value) }, '💾 שמור בפרומטים')
          ]),
          el('div', { class: 'pmk-check' }, [el('b', {}, '✅ צ׳קליסט איכות לתוצר:')].concat(
            skill.checklist.map(c => el('label', { class: 'pmk-check-row' }, [el('input', { type: 'checkbox' }), el('span', {}, c)]))))
        ])
      ])
    ]));
    refresh();
  }

  function renderHome(root, tab) {
    root.innerHTML = '';
    tab = tab || 'skills';
    const tabs = el('div', { class: 'ds-guide-tabs', style: { border: 'none', padding: '0' } }, [
      ['skills', '🧰 המחוללים'], ['frameworks', '📐 מסגרות'], ['templates', '📋 תבניות']
    ].map(([id, label]) => el('button', { class: 'ds-guide-tab' + (tab === id ? ' on' : ''), onClick: () => renderHome(root, id) }, label)));

    let content;
    if (tab === 'skills') {
      content = el('div', { class: 'ds-grid' }, D().PM_SKILLS.map(s => el('button', { class: 'ds-card', onClick: () => renderSkill(root, s) }, [
        el('span', { class: 'ds-card-ic' }, s.icon),
        el('b', {}, s.title),
        el('span', { class: 'ds-card-d' }, s.tagline),
        el('span', { class: 'pmk-caps' }, s.capabilities.slice(0, 2).join(' · '))
      ])));
    } else if (tab === 'frameworks') {
      content = el('div', { class: 'pmk-fw-list' }, D().PM_FRAMEWORKS.map(f => el('div', { class: 'pmk-fw' }, [
        el('div', { class: 'pmk-fw-h' }, [el('b', {}, f.name), el('span', { class: 'pmk-cmd' }, f.full)]),
        el('div', { class: 'pmk-fw-use' }, f.use),
        el('div', { class: 'ds-card-d' }, f.detail)
      ])));
    } else {
      content = el('div', { class: 'pmk-fw-list' }, D().PM_TEMPLATES.map(t => {
        const btn = el('button', { class: 'btn btn-sm' }, '📋 העתק');
        btn.addEventListener('click', () => copyText(t.body, btn));
        return el('div', { class: 'pmk-fw' }, [
          el('div', { class: 'pmk-fw-h' }, [el('b', {}, t.name), btn]),
          el('pre', { class: 'pmk-tpl-body' }, t.body)
        ]);
      }));
    }

    root.appendChild(el('div', { class: 'card ds-home' }, [
      el('div', { class: 'ds-home-head' }, [
        el('div', {}, [el('h2', {}, '🧰 ארגז PM'),
          el('p', { class: 'ds-home-sub' }, '8 מחוללי פרומפטים מקצועיים לניהול מוצר: מלא טופס קצר — קבל פרומפט מנוסח + צ׳קליסט איכות. שמור ישירות לעמוד הפרומטים.')]),
        el('button', { class: 'btn', onClick: openGuide }, '📖 הוראות הפעלה')
      ]),
      tabs, content
    ]));
  }

  App.register('pmkit', root => renderHome(root));
  window.PMKit = { openGuide };
})();
