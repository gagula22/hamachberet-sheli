(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // מעבדת דשבורדים — view 'filedash' (P-45). זרימה: קובץ → זווית+פלטה →
  // דשבורד חי → ייצוא HTML עצמאי. מדריך "הוראות הפעלה" מובנה (FD_GUIDE).
  // אפס Store/סנכרון — הכל בזיכרון הדפדפן לסשן הנוכחי בלבד.
  // ─────────────────────────────────────────────────────────────────────────
  const el = (t, a, k) => App.el(t, a || {}, k || []);
  let S = null; // { model, angles, angle, palette, dash }

  function openGuide() {
    document.getElementById('fd-guide')?.remove();
    const G = window.FD_GUIDE.GENERAL;
    const ov = el('div', { id: 'fd-guide', class: 'ds-guide-ov', onClick: e => { if (e.target === ov) ov.remove(); } });
    const panel = el('div', { class: 'ds-guide-panel' });
    panel.appendChild(el('div', { class: 'ds-guide-head' }, [
      el('b', {}, '📖 הוראות הפעלה — מעבדת דשבורדים'),
      el('button', { class: 'ds-guide-x', onClick: () => ov.remove() }, '✕')
    ]));
    const body = el('div', { class: 'ds-guide-body' });
    body.innerHTML = `<h3>${G.title}</h3>` + G.sections.map(s =>
      `<h4>${s.h}</h4><ul>${s.items.map(i => `<li>${i}</li>`).join('')}</ul>`).join('');
    panel.appendChild(body);
    ov.appendChild(panel); document.body.appendChild(ov);
  }

  async function onFile(file, root) {
    App.toast('⏳ מחלץ את ' + file.name + '…');
    try {
      const model = await window.FDX.extract(file);
      const angles = window.FDA.suggestAngles(model);
      S = { model, angles, angle: angles[0], palette: 'dark' };
      renderLab(root);
      App.toast('✓ חולץ: ' + (model.kind === 'table' ? model.rows.length + ' שורות' : 'מסמך טקסט'));
    } catch (e) {
      console.warn(e);
      App.toast('⚠️ החילוץ נכשל: ' + (e.message || 'קובץ לא נתמך'));
    }
  }

  function renderLab(root) {
    root.innerHTML = '';
    const card = el('div', { class: 'card fd-card' });

    // ── כותרת + מדריך ──
    card.appendChild(el('div', { class: 'ds-home-head' }, [
      el('div', {}, [el('h2', {}, '🧪 מעבדת דשבורדים'),
        el('p', { class: 'ds-home-sub' }, 'קובץ נכנס — דשבורד יוצא. Excel, CSV, PDF, Word או JSON: חילוץ, ניתוח ותובנות — הכל במחשב שלך, אף מספר לא מומצא.')]),
      el('button', { class: 'btn', onClick: openGuide }, '📖 הוראות הפעלה')
    ]));

    // ── אזור העלאה ──
    const fi = el('input', { type: 'file', accept: '.xlsx,.xls,.xlsm,.csv,.tsv,.json,.pdf,.docx,.doc,.txt,.md', style: { display: 'none' } });
    fi.addEventListener('change', () => { if (fi.files[0]) onFile(fi.files[0], root); fi.value = ''; });
    const drop = el('div', { class: 'fd-drop' + (S ? ' fd-drop-mini' : ''), onClick: () => fi.click() }, [
      el('div', { class: 'fd-drop-ic' }, '📂'),
      el('div', {}, S ? 'קובץ נוכחי: ' + S.model.name + ' — לחץ להחלפה' : 'גרור קובץ לכאן או לחץ לבחירה'),
      el('div', { class: 'fd-drop-sub' }, 'Excel · CSV · PDF · Word · JSON · TXT')
    ]);
    ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) onFile(f, root); });
    card.appendChild(drop);
    card.appendChild(fi);

    // ── בקרות: זווית / גיליון / פלטה ──
    if (S) {
      const controls = el('div', { class: 'fd-controls' });
      if (S.angles.length > 1) {
        const angBox = el('div', { class: 'fd-ctrl' }, [el('span', { class: 'fd-ctrl-l' }, '🎯 זווית המיקוד:')]);
        S.angles.forEach(a => {
          const b = el('button', { class: 'fd-angle' + (S.angle.id === a.id ? ' on' : ''), onClick: () => { S.angle = a; renderLab(root); } }, a.label);
          angBox.appendChild(b);
        });
        controls.appendChild(angBox);
      }
      if ((S.model.sheets || []).length > 1) {
        const sSel = el('select', { class: 'ds-in ds-mini' }, S.model.sheets.map(s => el('option', { value: s }, '📑 ' + s)));
        sSel.value = S.model.sheet;
        sSel.addEventListener('change', () => {
          S.model = window.FDX.useSheet(S.model, sSel.value);
          S.angles = window.FDA.suggestAngles(S.model); S.angle = S.angles[0];
          renderLab(root);
        });
        controls.appendChild(el('div', { class: 'fd-ctrl' }, [el('span', { class: 'fd-ctrl-l' }, 'גיליון:'), sSel]));
      }
      const pSel = el('select', { class: 'ds-in ds-mini' },
        Object.entries(window.FDR.PAL).map(([id, p]) => el('option', { value: id }, '🎨 ' + p.name)));
      pSel.value = S.palette;
      pSel.addEventListener('change', () => { S.palette = pSel.value; renderLab(root); });
      controls.appendChild(el('div', { class: 'fd-ctrl' }, [el('span', { class: 'fd-ctrl-l' }, 'פלטה:'), pSel]));
      card.appendChild(controls);

      // ── הדשבורד עצמו ──
      const host = el('div', { class: 'fd-dash' });
      card.appendChild(host);
      S.dash = window.FDA.buildDash(S.model, S.angle);
      const title = (S.model.kind === 'table' && S.angle ? S.angle.label : 'ניתוח ' + S.model.name);
      window.FDR.render(host, S.model, S.dash, S.palette, title);

      card.appendChild(el('div', { class: 'ds-export-bar' }, [
        el('button', { class: 'btn', onClick: () => window.FDE.exportHtml(S.model, S.dash, S.palette, title) }, '🌐 ייצוא HTML עצמאי'),
        el('span', { class: 'ds-path-hint' }, 'קובץ אחד עם הגרפים צרובים — נפתח בכל מחשב')
      ]));
    }

    root.appendChild(card);
  }

  App.register('filedash', root => { window.FDR.destroyCharts(); renderLab(root); });
  window.FileDash = { openGuide };
})();
