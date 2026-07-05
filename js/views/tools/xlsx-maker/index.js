(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // יוצר אקסל (P-50) — יצירת גיליונות עם נוסחאות אקסל אמיתיות (לא ערכים
  // קבועים!), מקומית, דרך SheetJS (ה-vendor של מעבדת הדשבורדים; טעינה עצלה
  // עם בדיקת window.XLSX — אפס התנגשות). 3 תבניות פיננסיות + טבלה חופשית.
  // הנוסחאות (SUM, מכפלות מע"מ, יתרות) חיות בקובץ — עדכון ערך מעדכן סיכומים.
  // ─────────────────────────────────────────────────────────────────────────
  var VAT = 0.18;

  var _xlsxP = null;
  function ensureXlsx() {
    if (window.XLSX) return Promise.resolve();
    if (_xlsxP) return _xlsxP;
    _xlsxP = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = 'js/vendor/xlsx.full.min.js';
      s.onload = res; s.onerror = function () { rej(new Error('SheetJS לא נטען')); };
      document.head.appendChild(s);
    });
    return _xlsxP;
  }

  var N = function (v) { return { t: 'n', v: v }; };
  var S = function (v) { return { t: 's', v: v }; };
  var F = function (f) { return { t: 'n', f: f }; };

  // ── שלוש התבניות + טבלה חופשית ──────────────────────────────────────────
  var TEMPLATES = [
    {
      id: 'expenses', icon: '🧾', name: 'מעקב הוצאות חודשי',
      desc: 'תאריך, תיאור, קטגוריה, סכום — עמודות מע״מ וסה״כ מחושבות בנוסחה, ושורת סיכום חיה',
      build: function () {
        var rows = [[S('תאריך'), S('תיאור'), S('קטגוריה'), S('סכום לפני מע״מ'), S('מע״מ 18%'), S('סה״כ')]];
        for (var r = 2; r <= 31; r++) rows.push([S(''), S(''), S(''), S(''), F('IF(D' + r + '="","",D' + r + '*' + VAT + ')'), F('IF(D' + r + '="","",D' + r + '+E' + r + ')')]);
        rows.push([S(''), S(''), S('סה״כ:'), F('SUM(D2:D31)'), F('SUM(E2:E31)'), F('SUM(F2:F31)')]);
        return { name: 'הוצאות', rows: rows, cols: [12, 26, 14, 15, 12, 13] };
      }
    },
    {
      id: 'budget', icon: '💰', name: 'תקציב הכנסות מול הוצאות',
      desc: 'שני מקטעים עם סיכומים בנוסחה ושורת נטו (הכנסות מינוס הוצאות) חיה',
      build: function () {
        var rows = [[S('הכנסות'), S(''), S('סכום')]];
        for (var r = 2; r <= 9; r++) rows.push([S(''), S(''), S('')]);
        rows.push([S('סה״כ הכנסות'), S(''), F('SUM(C2:C9)')]);   // שורה 10
        rows.push([S(''), S(''), S('')]);
        rows.push([S('הוצאות'), S(''), S('סכום')]);              // שורה 12
        for (var r2 = 13; r2 <= 24; r2++) rows.push([S(''), S(''), S('')]);
        rows.push([S('סה״כ הוצאות'), S(''), F('SUM(C13:C24)')]); // שורה 25
        rows.push([S(''), S(''), S('')]);
        rows.push([S('💎 נטו (הכנסות - הוצאות)'), S(''), F('C10-C25')]);
        return { name: 'תקציב', rows: rows, cols: [30, 6, 16] };
      }
    },
    {
      id: 'payments', icon: '🤝', name: 'מעקב תשלומים וקבלות',
      desc: 'לקוח, חשבונית, סכום, שולם — עמודת יתרה בנוסחה וסיכומי חוב פתוח',
      build: function () {
        var rows = [[S('לקוח'), S('מס׳ חשבונית'), S('תאריך'), S('סכום'), S('שולם'), S('יתרה')]];
        for (var r = 2; r <= 25; r++) rows.push([S(''), S(''), S(''), S(''), S(''), F('IF(D' + r + '="","",D' + r + '-IF(E' + r + '="",0,E' + r + '))')]);
        rows.push([S('סה״כ'), S(''), S(''), F('SUM(D2:D25)'), F('SUM(E2:E25)'), F('SUM(F2:F25)')]);
        return { name: 'תשלומים', rows: rows, cols: [22, 14, 12, 12, 12, 12] };
      }
    },
    {
      id: 'custom', icon: '🧮', name: 'טבלה חופשית עם סיכומים',
      desc: 'הגדר עמודות משלך — כל עמודה מספרית מקבלת שורת SUM חיה בתחתית',
      custom: true
    }
  ];

  function buildXlsxMaker() {
    var status = window.PdfOps.statusEl();
    var customBox = App.el('div', { style: { display: 'none', marginTop: '10px' } });
    var colsInput = document.createElement('input');
    colsInput.type = 'text'; colsInput.value = 'תיאור, כמות, מחיר';
    colsInput.style.cssText = 'width:100%;margin-top:6px;padding:8px 12px;border:1px solid var(--line);border-radius:var(--r-sm);font-family:inherit;';
    var rowsInput = document.createElement('input');
    rowsInput.type = 'number'; rowsInput.value = '20'; rowsInput.min = '1'; rowsInput.max = '500';
    rowsInput.style.cssText = 'width:110px;margin-top:6px;padding:8px 12px;border:1px solid var(--line);border-radius:var(--r-sm);font-family:inherit;';
    customBox.appendChild(App.el('label', { style: { fontSize: '13px' } }, 'שמות העמודות (מופרדות בפסיק) — עמודה שמכילה "סכום/מחיר/כמות/עלות" תסוכם:'));
    customBox.appendChild(colsInput);
    customBox.appendChild(App.el('label', { style: { fontSize: '13px', display: 'block', marginTop: '8px' } }, 'מספר שורות:'));
    customBox.appendChild(rowsInput);

    function customTemplate() {
      var names = colsInput.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      if (!names.length) return null;
      var nRows = Math.min(500, Math.max(1, +rowsInput.value || 20));
      var numeric = names.map(function (n) { return /סכום|מחיר|כמות|עלות|שעות|יח/.test(n); });
      var rows = [names.map(S)];
      for (var r = 0; r < nRows; r++) rows.push(names.map(function () { return S(''); }));
      var colL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      rows.push(names.map(function (n, c) {
        return numeric[c] ? F('SUM(' + colL[c] + '2:' + colL[c] + (nRows + 1) + ')') : S(c === 0 ? 'סה״כ' : '');
      }));
      return { name: 'גיליון', rows: rows, cols: names.map(function () { return 18; }) };
    }

    async function generate(tpl) {
      window.PdfOps.setStatus(status, '⏳ בונה גיליון…');
      try {
        await ensureXlsx();
        var spec = tpl.custom ? customTemplate() : tpl.build();
        if (!spec) { window.PdfOps.setStatus(status, 'הגדר לפחות עמודה אחת', 'err'); return; }
        var ws = XLSX.utils.aoa_to_sheet(spec.rows);
        ws['!cols'] = spec.cols.map(function (w) { return { wch: w }; });
        if (!ws['!views']) ws['!views'] = [{ RTL: true }];
        var wb = XLSX.utils.book_new();
        wb.Workbook = { Views: [{ RTL: true }] };
        XLSX.utils.book_append_sheet(wb, ws, spec.name);
        XLSX.writeFile(wb, (tpl.custom ? 'טבלה' : tpl.name) + '.xlsx');
        var fCount = spec.rows.reduce(function (n, row) { return n + row.filter(function (c) { return c && c.f; }).length; }, 0);
        window.PdfOps.setStatus(status, '✓ הקובץ ירד — עם ' + fCount + ' נוסחאות אקסל חיות (עדכון ערך יעדכן את הסיכומים)', 'ok');
      } catch (e) { console.error('[xlsx-maker]', e); window.PdfOps.setStatus(status, 'שגיאה: ' + (e && e.message || ''), 'err'); }
    }

    var grid = App.el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '12px', marginTop: '12px' } },
      TEMPLATES.map(function (tpl) {
        return App.el('button', {
          class: 'ds-card',
          onClick: function () {
            if (tpl.custom) { customBox.style.display = customBox.style.display === 'none' ? 'block' : 'none'; if (customBox.style.display === 'block') return; }
            generate(tpl);
          }
        }, [
          App.el('span', { class: 'ds-card-ic' }, tpl.icon),
          App.el('b', {}, tpl.name),
          App.el('span', { class: 'ds-card-d' }, tpl.desc)
        ]);
      }));

    var customGo = App.el('button', { class: 'btn', style: { marginTop: '10px' }, onClick: function () { generate(TEMPLATES[3]); } }, '📥 צור והורד');
    customBox.appendChild(customGo);

    return App.el('div', { class: 'card' }, [
      App.el('div', { class: 'row row-between', style: { marginBottom: '4px' } },
        [App.el('h2', {}, '🧮  יוצר אקסל'), App.el('span', { class: 'chip lavender' }, 'נוסחאות אמיתיות — לא ערכים קבועים')]),
      App.el('p', { style: { fontSize: '13px', color: 'var(--ink-mute)' } }, 'בחר תבנית — הקובץ יורד עם נוסחאות SUM/מע״מ/יתרה חיות, RTL, ורוחבי עמודות מסודרים.'),
      grid, customBox, status,
      App.el('p', { style: { fontSize: '12px', color: 'var(--ink-mute)', margin: '10px 0 0' } }, '🔒 רץ מקומית. לניתוח קובץ קיים — מעבדת הדשבורדים 🧪 בסרגל.')
    ]);
  }
  window.Tools = window.Tools || {};
  window.Tools.xlsxMaker = buildXlsxMaker;
})();
