(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // סטודיו חיפוש ארגוני — view 'searchstudio' (P-48). פורט של
  // Enterprise-Search-Studio: בונה פקודות /search + /digest (עם כל המסננים),
  // הדגמה חיה על נתוני-דמה (תשובה מסונתזת/ייחוס/ביטחון + digest), ומדריך
  // מלא (5 הסקילים, עדיפויות מקורות, זרימה). הנתונים ב-data.js (window.ES.data).
  // סינרגיה מותרת: שמירת פקודה ל-Store('prompts') בסכימת עמוד הפרומטים.
  // ─────────────────────────────────────────────────────────────────────────
  const el = (t, a, k) => App.el(t, a || {}, k || []);
  const D = () => window.ES.data;
  const S = { mode: 'search', query: '', filters: {}, digestRange: 'daily' };

  function buildCommand() {
    if (S.mode === 'digest') {
      if (S.digestRange === 'since') return '/digest --since ' + (S.filters.after || '<תאריך>');
      return '/digest --' + S.digestRange;
    }
    const parts = ['/search'];
    if (S.query.trim()) parts.push(S.query.trim());
    D().filters.forEach(f => { const v = (S.filters[f.key] || '').trim(); if (v) parts.push(f.key + ':' + v); });
    return parts.join(' ');
  }

  function copyText(text, btn) {
    const done = () => { const o = btn.textContent; btn.textContent = '✓ הועתק'; setTimeout(() => btn.textContent = o, 1500); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(() => {});
    else { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) {} ta.remove(); }
  }

  const srcIcon = id => (D().sources.find(s => s.id === id) || {}).icon || '📄';

  // ── טאב 1: בונה פקודות ───────────────────────────────────────────────────
  function tabBuilder(root) {
    const box = el('div', { class: 'ess-builder' });
    const outCode = el('code', { class: 'ess-cmd' });
    const refresh = () => { outCode.textContent = buildCommand(); };

    function rebuild() {
      box.innerHTML = '';
      const seg = el('div', { class: 'ds-guide-tabs', style: { border: 'none', padding: '0' } }, [
        ['search', '🔍 /search'], ['digest', '🗞️ /digest']
      ].map(([m, l]) => el('button', { class: 'ds-guide-tab' + (S.mode === m ? ' on' : ''), onClick: () => { S.mode = m; rebuild(); } }, l)));
      box.appendChild(seg);

      if (S.mode === 'search') {
        const q = el('input', { class: 'ds-in', type: 'text', placeholder: 'לדוגמה: מה הסטטוס של Project Aurora?', value: S.query });
        q.addEventListener('input', () => { S.query = q.value; refresh(); });
        box.appendChild(el('div', { class: 'ds-field' }, [el('label', { class: 'ds-label' }, 'מה לחפש?'), q]));
        box.appendChild(el('div', { class: 'ess-chips' }, D().sources.map(s => el('span', { class: 'chip', title: s.finds + ' — ' + s.examples.join(', ') }, s.icon + ' ' + s.name))));
        const grid = el('div', { class: 'ess-filters' });
        D().filters.forEach(f => {
          const inp = el('input', { class: 'ds-in', type: 'text', placeholder: f.placeholder, value: S.filters[f.key] || '' });
          inp.addEventListener('input', () => { S.filters[f.key] = inp.value; refresh(); });
          grid.appendChild(el('div', { class: 'ds-field' }, [el('label', { class: 'ds-label', title: f.hint }, f.label + ' (' + f.key + ':)'), inp]));
        });
        box.appendChild(grid);
      } else {
        const ranges = [['daily', 'יומי — 24 שעות'], ['weekly', 'שבועי — 7 ימים'], ['since', 'מתאריך מותאם']];
        box.appendChild(el('div', { class: 'ess-chips' }, ranges.map(([id, l]) =>
          el('button', { class: 'fd-angle' + (S.digestRange === id ? ' on' : ''), onClick: () => { S.digestRange = id; rebuild(); } }, l))));
        if (S.digestRange === 'since') {
          const inp = el('input', { class: 'ds-in', type: 'text', placeholder: '2026-06-01 / Monday', value: S.filters.after || '' });
          inp.addEventListener('input', () => { S.filters.after = inp.value; refresh(); });
          box.appendChild(el('div', { class: 'ds-field' }, [el('label', { class: 'ds-label' }, 'מאיזה תאריך?'), inp]));
        }
      }

      const copyBtn = el('button', { class: 'btn' }, '📋 העתק');
      copyBtn.addEventListener('click', () => copyText(buildCommand(), copyBtn));
      box.appendChild(el('div', { class: 'ess-out' }, [
        el('div', { class: 'ds-label' }, 'הפקודה שלך — להדבקה בצ׳אט של קלוד/Cowork:'),
        el('div', { class: 'ess-out-row' }, [outCode, copyBtn,
          el('button', { class: 'btn btn-ghost btn-sm', onClick: () => {
            const cur = Store.get('prompts') || [];
            Store.set('prompts', [{ id: Store.uid(), skill: '🔎 סטודיו חיפוש', title: buildCommand().slice(0, 60), body: buildCommand() }].concat(cur));
            App.toast('📋 נשמר בעמוד הפרומטים');
          } }, '💾 לפרומטים')]),
        el('p', { class: 'ds-path-hint' }, 'החיפוש עצמו רץ אצל קלוד מול המקורות שחיברת (Slack, מייל, Drive…) — האתר בונה את הפקודה המדויקת.')
      ]));
      refresh();
    }
    rebuild();
    root.appendChild(box);
  }

  // ── טאב 2: הדגמה ─────────────────────────────────────────────────────────
  function tabDemo(root) {
    const box = el('div', {});
    const stage = el('div', { class: 'ess-stage' });
    const searches = Object.keys(D().mockSearch);

    function showSearch(key) {
      const m = D().mockSearch[key];
      stage.innerHTML = '';
      stage.appendChild(el('div', { class: 'ess-answer' }, [
        el('div', { class: 'ess-conf ' + m.confidence }, m.confidence === 'high' ? '● ביטחון גבוה' : '● ביטחון בינוני'),
        el('p', {}, m.answer),
        el('div', { class: 'ds-label', style: { marginTop: '10px' } }, 'ייחוס מקורות:')
      ].concat(m.hits.map(h => el('div', { class: 'ess-hit' }, [
        el('span', { class: 'ess-hit-ic' }, srcIcon(h.source)),
        el('div', {}, [el('b', {}, h.title), el('span', { class: 'ess-hit-meta' }, ' · ' + h.meta), el('div', { class: 'ds-card-d' }, h.snippet)])
      ])))));
    }
    function showDigest(kind) {
      const g = D().mockDigest[kind];
      stage.innerHTML = '';
      const secs = [];
      secs.push(el('div', { class: 'ess-conf high' }, '🗞️ ' + g.range));
      if (g.actions.length) secs.push(el('div', { class: 'ess-dsec' }, [el('b', {}, '📌 לטיפולך')].concat(g.actions.map(a => el('div', { class: 'ess-hit' }, [el('span', { class: 'ess-hit-ic' }, srcIcon(a.source)), el('div', {}, [el('span', {}, a.text), el('span', { class: 'ess-hit-meta' }, ' · מ' + a.from + ' · יעד: ' + a.due)])])))));
      if (g.decisions.length) secs.push(el('div', { class: 'ess-dsec' }, [el('b', {}, '⚖️ החלטות')].concat(g.decisions.map(d => el('div', { class: 'ess-hit' }, [el('span', { class: 'ess-hit-ic' }, srcIcon(d.source)), el('span', {}, d.text + ' (' + d.ctx + ')')])))));
      g.groups.forEach(gr => secs.push(el('div', { class: 'ess-dsec' }, [el('b', {}, '🧵 ' + gr.topic)].concat(gr.items.map(i => el('div', { class: 'ess-hit' }, [el('span', { class: 'ess-hit-ic' }, srcIcon(i.source)), el('span', {}, i.text)]))))));
      if (g.mentions.length) secs.push(el('div', { class: 'ess-dsec' }, [el('b', {}, '🏷️ אזכורים שלך')].concat(g.mentions.map(m => el('div', { class: 'ess-hit' }, [el('span', { class: 'ess-hit-ic' }, srcIcon(m.source)), el('span', {}, m.text)])))));
      secs.push(el('div', { class: 'ess-stats' }, `סיכום: ${g.stats.actions} משימות · ${g.stats.decisions} החלטות · ${g.stats.mentions} אזכורים · ${g.stats.docs} עדכוני מסמכים`));
      secs.forEach(s => stage.appendChild(s));
    }

    box.appendChild(el('p', { class: 'ds-home-sub' }, 'כך נראית תשובה אמיתית (על נתוני דמה): תשובה מסונתזת, ייחוס לכל מקור וציון ביטחון.'));
    box.appendChild(el('div', { class: 'ess-chips' },
      searches.map(k => el('button', { class: 'fd-angle', onClick: () => showSearch(k) }, '🔍 ' + k))
        .concat([el('button', { class: 'fd-angle', onClick: () => showDigest('daily') }, '🗞️ digest יומי'),
                 el('button', { class: 'fd-angle', onClick: () => showDigest('weekly') }, '🗞️ digest שבועי')])));
    box.appendChild(stage);
    showSearch(searches[0]);
    root.appendChild(box);
  }

  // ── טאב 3: מדריך ─────────────────────────────────────────────────────────
  function tabGuide(root) {
    const box = el('div', { class: 'ess-guide' });
    D().skills.forEach(s => {
      box.appendChild(el('div', { class: 'pmk-fw' }, [
        el('div', { class: 'pmk-fw-h' }, [el('b', {}, s.icon + ' ' + s.title), el('span', { class: 'pmk-cmd' }, s.cmd + (s.kind === 'auto' ? ' · אוטומטי' : ''))]),
        el('div', { class: 'ds-card-d' }, s.tagline),
        el('ul', { class: 'ess-feat' }, s.features.map(f => el('li', {}, f)))
      ].concat(s.examples.length ? [el('div', { class: 'ess-exs' }, s.examples.map(e => {
        const b = el('button', { class: 'btn btn-sm' }, '📋');
        b.addEventListener('click', () => copyText(e, b));
        return el('div', { class: 'ess-ex' }, [el('code', {}, e), b]);
      }))] : [])));
    });
    box.appendChild(el('div', { class: 'pmk-fw' }, [
      el('div', { class: 'pmk-fw-h' }, [el('b', {}, '🧭 איזה מקור מנצח לכל סוג שאלה')]),
      el('div', { class: 'ess-qt' }, D().queryTypes.map(q => el('div', { class: 'ess-qt-row' }, [
        el('b', {}, q.label), el('span', { class: 'ds-card-d' }, q.desc),
        el('span', { class: 'ess-qt-pri' }, q.priority.map(srcIcon).join(' → '))
      ])))
    ]));
    box.appendChild(el('div', { class: 'pmk-fw' }, [
      el('div', { class: 'pmk-fw-h' }, [el('b', {}, '🔄 הזרימה מהשאלה לתשובה')]),
      el('div', { class: 'ess-flow' }, D().flow.map((f, i) => el('span', { class: 'step' }, (i + 1) + '. ' + f)))
    ]));
    root.appendChild(box);
  }

  function render(root, tab) {
    root.innerHTML = '';
    tab = tab || 'builder';
    const card = el('div', { class: 'card ds-home' });
    card.appendChild(el('div', { class: 'ds-home-head' }, [
      el('div', {}, [el('h2', {}, '🔎 סטודיו חיפוש ארגוני'),
        el('p', { class: 'ds-home-sub' }, 'בונה פקודות מדויקות ל-/search ו-/digest של Cowork — מקורות, מסננים וטווחי זמן. כולל הדגמה ומדריך מלא.')]),
      el('button', { class: 'btn', onClick: () => render(root, 'guide') }, '📖 הוראות הפעלה')
    ]));
    card.appendChild(el('div', { class: 'ds-guide-tabs', style: { border: 'none', padding: '0' } }, [
      ['builder', '🛠️ בונה פקודות'], ['demo', '▶️ הדגמה'], ['guide', '📖 מדריך']
    ].map(([id, l]) => el('button', { class: 'ds-guide-tab' + (tab === id ? ' on' : ''), onClick: () => render(root, id) }, l))));
    const body = el('div', {});
    card.appendChild(body);
    if (tab === 'builder') tabBuilder(body);
    else if (tab === 'demo') tabDemo(body);
    else tabGuide(body);
    root.appendChild(card);
  }

  App.register('searchstudio', root => render(root));
  window.SearchStudio = {};
})();
