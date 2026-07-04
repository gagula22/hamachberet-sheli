(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // סטודיו מסמכים — view 'docstudio'. גלריית תבניות → עורך (טופס + תצוגת A4
  // חיה) → ייצוא PDF/Word/HTML. מדריך "הוראות הפעלה" מובנה (DS_GUIDE).
  // טיוטות ב-IndexedDB משלו ('hamachberet-docstudio') — אפס נגיעה ב-Store,
  // בסכימה ובסנכרון. תלות מותרת: window.HtmlToPdf (רכיב משותף), App.
  // ─────────────────────────────────────────────────────────────────────────
  const D = window.DS_DATA, G = window.DS_GUIDE, X = window.DS_EXPORT;
  const el = (t, a, k) => App.el(t, a || {}, k || []);

  // ── טיוטות: IndexedDB עצמאי ──────────────────────────────────────────────
  const DB_NAME = 'hamachberet-docstudio', STORE = 'drafts';
  let _dbP = null;
  function db() {
    if (_dbP) return _dbP;
    _dbP = new Promise((res, rej) => {
      const q = indexedDB.open(DB_NAME, 1);
      q.onupgradeneeded = () => { if (!q.result.objectStoreNames.contains(STORE)) q.result.createObjectStore(STORE, { keyPath: 'id' }); };
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
    return _dbP;
  }
  const tx = (mode, fn) => db().then(d => new Promise((res, rej) => {
    const t = d.transaction(STORE, mode); const out = fn(t.objectStore(STORE));
    t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error);
  }));
  const listDrafts = () => db().then(d => new Promise((res, rej) => {
    const q = d.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    q.onsuccess = () => res((q.result || []).sort((a, b) => b.updatedAt - a.updatedAt)); q.onerror = () => rej(q.error);
  }));
  const putDraft = m => tx('readwrite', s => s.put(m));
  const delDraft = id => tx('readwrite', s => s.delete(id));

  // ── מצב עריכה נוכחי ──────────────────────────────────────────────────────
  let cur = null; // { tpl, data, palette, font, draftId }

  function collectAngles(tpl) { // ברירות מחדל לשדות
    const data = {};
    tpl.fields.forEach(f => { data[f.k] = f.def ? f.def() : (f.t === 'items' ? [{ desc: '', qty: 1, price: '' }] : ''); });
    return data;
  }

  // ── בניית גוף המסמך + עדכון תצוגה ────────────────────────────────────────
  function buildBody() { try { return cur.tpl.build(cur.data); } catch (e) { console.warn(e); return '<p>שגיאה בבניית המסמך</p>'; } }
  let _pv = null, _pvT = null;
  function refreshPreview() {
    clearTimeout(_pvT);
    _pvT = setTimeout(() => {
      if (!_pv || !document.contains(_pv)) return;
      _pv.innerHTML = `<style>${D.baseCss(cur.palette, cur.font)}</style><div class="ds-doc">${buildBody()}</div>`;
    }, 180);
  }

  // ── טופס גנרי מהסכמה ─────────────────────────────────────────────────────
  function fieldRow(f) {
    const wrap = el('div', { class: 'ds-field' });
    wrap.appendChild(el('label', { class: 'ds-label' }, f.label + (f.req ? ' *' : '')));
    const set = v => { cur.data[f.k] = v; refreshPreview(); };
    if (f.t === 'ta') {
      const ta = el('textarea', { class: 'ds-in', rows: '3', placeholder: f.ph || '' });
      ta.value = cur.data[f.k] || '';
      ta.addEventListener('input', () => set(ta.value));
      wrap.appendChild(ta);
    } else if (f.t === 'sel') {
      const sel = el('select', { class: 'ds-in' }, f.opts.map(o => el('option', { value: o[0] }, o[1])));
      sel.value = cur.data[f.k] || f.opts[0][0];
      sel.addEventListener('change', () => set(sel.value));
      wrap.appendChild(sel);
    } else if (f.t === 'items') {
      wrap.appendChild(itemsEditor(f));
    } else {
      const inp = el('input', { class: 'ds-in', type: f.t === 'n' ? 'number' : 'text', placeholder: f.ph || '' });
      inp.value = cur.data[f.k] || '';
      inp.addEventListener('input', () => set(inp.value));
      wrap.appendChild(inp);
    }
    return wrap;
  }

  function itemsEditor(f) {
    const tasks = f.itemsMode === 'tasks';
    const heads = tasks ? ['משימה', 'אחראי', 'יעד'] : ['תיאור', 'כמות', 'מחיר ₪'];
    const box = el('div', { class: 'ds-items' });
    function render() {
      box.innerHTML = '';
      box.appendChild(el('div', { class: 'ds-items-h' }, heads.map(h => el('span', {}, h)).concat(el('span', {}, ''))));
      (cur.data[f.k] || []).forEach((it, i) => {
        const row = el('div', { class: 'ds-items-r' });
        [['desc', heads[0]], ['qty', heads[1]], ['price', heads[2]]].forEach(([key]) => {
          const inp = el('input', { class: 'ds-in', type: (!tasks && key !== 'desc') ? 'number' : 'text' });
          inp.value = it[key] != null ? it[key] : '';
          inp.addEventListener('input', () => { it[key] = inp.value; refreshPreview(); });
          row.appendChild(inp);
        });
        row.appendChild(el('button', { class: 'ds-items-x', title: 'הסר שורה', onClick: () => { cur.data[f.k].splice(i, 1); render(); refreshPreview(); } }, '✕'));
        box.appendChild(row);
      });
      box.appendChild(el('button', {
        class: 'ds-add', onClick: () => { cur.data[f.k].push(tasks ? { desc: '', qty: '', price: '' } : { desc: '', qty: 1, price: '' }); render(); }
      }, '+ שורה'));
    }
    render();
    return box;
  }

  function validate() {
    const missing = cur.tpl.fields.filter(f => {
      if (!f.req) return false;
      const v = cur.data[f.k];
      if (f.t === 'items') return !(v || []).some(it => (it.desc || '').trim());
      return !(String(v || '').trim());
    });
    if (missing.length) { App.toast('חסרים שדות חובה: ' + missing.map(f => f.label).join(' · ')); return false; }
    return true;
  }

  // ── מדריך "הוראות הפעלה" ─────────────────────────────────────────────────
  function openGuide(tplId) {
    document.getElementById('ds-guide')?.remove();
    const ov = el('div', { id: 'ds-guide', class: 'ds-guide-ov', onClick: e => { if (e.target === ov) ov.remove(); } });
    const panel = el('div', { class: 'ds-guide-panel' });
    panel.appendChild(el('div', { class: 'ds-guide-head' }, [
      el('b', {}, '📖 הוראות הפעלה — סטודיו מסמכים'),
      el('button', { class: 'ds-guide-x', onClick: () => ov.remove() }, '✕')
    ]));
    const tabs = el('div', { class: 'ds-guide-tabs' });
    const body = el('div', { class: 'ds-guide-body' });
    function showGeneral() {
      body.innerHTML = `<h3>${G.GENERAL.title}</h3>` + G.GENERAL.sections.map(s =>
        `<h4>${s.h}</h4><ul>${s.items.map(i => `<li>${i}</li>`).join('')}</ul>`).join('');
    }
    function showTpl(t) {
      const g = G.PER_TEMPLATE[t.id]; if (!g) return showGeneral();
      body.innerHTML = `<h3>${t.icon} ${t.title}</h3>
        <h4>מה מקבלים בדיוק</h4><p>${g.what}</p>
        <h4>מה למלא ולבקש כדי למצות את הכלי</h4><ul>${g.ask.map(a => `<li>${a}</li>`).join('')}</ul>
        <div class="ds-guide-tip">💡 ${g.tip}</div>`;
    }
    const mkTab = (label, fn, active) => {
      const b = el('button', { class: 'ds-guide-tab' + (active ? ' on' : ''), onClick: () => { tabs.querySelectorAll('.on').forEach(x => x.classList.remove('on')); b.classList.add('on'); fn(); } }, label);
      return b;
    };
    tabs.appendChild(mkTab('🧭 כללי', showGeneral, !tplId));
    D.TEMPLATES.forEach(t => tabs.appendChild(mkTab(t.icon + ' ' + t.title, () => showTpl(t), tplId === t.id)));
    tplId ? showTpl(D.TEMPLATES.find(t => t.id === tplId)) : showGeneral();
    panel.appendChild(tabs); panel.appendChild(body);
    ov.appendChild(panel); document.body.appendChild(ov);
  }

  // ── מסך עורך ─────────────────────────────────────────────────────────────
  function renderEditor(root) {
    root.innerHTML = '';
    const tpl = cur.tpl;

    const palSel = el('select', { class: 'ds-in ds-mini', title: 'פלטת צבע' },
      D.PALETTES.map(p => el('option', { value: p.id }, '🎨 ' + p.name)));
    palSel.value = cur.palette;
    palSel.addEventListener('change', () => { cur.palette = palSel.value; refreshPreview(); });
    const fontSel = el('select', { class: 'ds-in ds-mini', title: 'גופן' },
      D.FONTS.map(f => el('option', { value: f.id }, '🔤 ' + f.name)));
    fontSel.value = cur.font;
    fontSel.addEventListener('change', () => { cur.font = fontSel.value; refreshPreview(); });

    const head = el('div', { class: 'ds-edit-head' }, [
      el('button', { class: 'btn btn-sm', onClick: () => renderGallery(root) }, '→ חזרה לתבניות'),
      el('b', { class: 'ds-edit-title' }, tpl.icon + ' ' + tpl.title),
      el('div', { class: 'ds-edit-opts' }, [palSel, fontSel,
        el('button', { class: 'btn btn-sm', onClick: () => openGuide(tpl.id) }, '📖 הוראות')])
    ]);

    const form = el('div', { class: 'ds-form' }, tpl.fields.map(fieldRow));
    _pv = el('div', { class: 'ds-prev-page' });
    const prevWrap = el('div', { class: 'ds-prev' }, [_pv]);

    async function saveDraft() {
      const name = (cur.data.docNum || cur.data.title || cur.data.client || tpl.title) + ' · ' + new Date().toLocaleDateString('he-IL');
      const d = { id: cur.draftId || ('ds' + Date.now().toString(36)), tplId: tpl.id, name, data: cur.data, palette: cur.palette, font: cur.font, updatedAt: Date.now() };
      cur.draftId = d.id;
      await putDraft(d);
      App.toast('💾 הטיוטה נשמרה במחשב');
    }
    const title = () => (cur.data.title || cur.data.docNum ? (tpl.title + ' ' + (cur.data.docNum || '')) : tpl.title).trim();
    const css = () => D.baseCss(cur.palette, cur.font);

    const bar = el('div', { class: 'ds-export-bar' }, [
      el('button', { class: 'btn', onClick: () => { if (validate()) X.exportPdf(title(), css(), buildBody()); } }, '🖨️ PDF'),
      el('button', { class: 'btn', onClick: () => { if (validate()) X.exportWord(title(), css(), buildBody()); } }, '📄 Word'),
      el('button', { class: 'btn', onClick: () => { if (validate()) X.exportHtml(title(), css(), buildBody()); } }, '🌐 HTML'),
      el('button', { class: 'btn btn-ghost', onClick: saveDraft }, '💾 שמור טיוטה'),
      el('span', { class: 'ds-path-hint' }, tpl.path === 'pdf' ? 'מומלץ לתבנית זו: PDF' : tpl.path === 'word' ? 'מומלץ לתבנית זו: Word' : '')
    ]);

    root.appendChild(el('div', { class: 'ds-editor' }, [head,
      el('div', { class: 'ds-edit-grid' }, [el('div', {}, [form, bar]), prevWrap])]));
    refreshPreview();
  }

  // ── מסך גלריה ────────────────────────────────────────────────────────────
  function renderGallery(root) {
    root.innerHTML = '';
    cur = null;
    const cards = D.TEMPLATES.map(t => el('button', {
      class: 'ds-card', onClick: () => {
        cur = { tpl: t, data: collectAngles(t), palette: t.palette, font: t.font || 'heebo', draftId: null };
        renderEditor(root);
      }
    }, [
      el('span', { class: 'ds-card-ic' }, t.icon),
      el('b', {}, t.title),
      el('span', { class: 'ds-card-d' }, t.desc)
    ]));

    const draftsBox = el('div', { class: 'ds-drafts' });
    listDrafts().then(ds => {
      if (!ds.length) return;
      draftsBox.appendChild(el('h3', {}, '📂 טיוטות שמורות (במחשב הזה)'));
      ds.slice(0, 12).forEach(d => {
        const t = D.TEMPLATES.find(x => x.id === d.tplId); if (!t) return;
        draftsBox.appendChild(el('div', { class: 'ds-draft-row' }, [
          el('button', {
            class: 'ds-draft-open', onClick: () => {
              cur = { tpl: t, data: d.data, palette: d.palette, font: d.font, draftId: d.id };
              renderEditor(root);
            }
          }, t.icon + ' ' + d.name),
          el('button', { class: 'ds-items-x', title: 'מחק טיוטה', onClick: ev => { ev.stopPropagation(); if (confirm('למחוק את הטיוטה?')) delDraft(d.id).then(() => renderGallery(root)); } }, '✕')
        ]));
      });
    }).catch(() => {});

    root.appendChild(el('div', { class: 'card ds-home' }, [
      el('div', { class: 'ds-home-head' }, [
        el('div', {}, [el('h2', {}, '📄 סטודיו מסמכים'),
          el('p', { class: 'ds-home-sub' }, 'מסמכים עסקיים בעברית תקינה — בחר תבנית, מלא טופס, ראה תצוגה חיה, ייצא PDF / Word / HTML. הכל רץ במחשב שלך.')]),
        el('button', { class: 'btn', onClick: () => openGuide(null) }, '📖 הוראות הפעלה')
      ]),
      el('div', { class: 'ds-grid' }, cards),
      draftsBox
    ]));
  }

  App.register('docstudio', root => renderGallery(root));
  window.DocStudio = { openGuide };
})();
