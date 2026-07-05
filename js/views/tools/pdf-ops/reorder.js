(function () {
  // Reorder — סידור עמודים מחדש לפי רצף שהמשתמש מקליד (למשל 3,1,2,5-7).
  // בניגוד ל-parseRanges (ממוין+ייחודי), כאן הסדר קובע וכפילויות מותרות
  // (שכפול עמוד = לכתוב אותו פעמיים). מקומי לחלוטין (pdf-lib copyPages).
  function buildPdfReorder() {
    var file = null, pageCount = 0;
    var status = window.PdfOps.statusEl();

    var orderInput = document.createElement('input');
    orderInput.type = 'text';
    orderInput.placeholder = 'לדוגמה: 3,1,2,5-7 (עמוד שלא מוזכר — לא ייכלל)';
    orderInput.style.cssText = 'width:100%;margin-top:6px;padding:9px 12px;border:1px solid var(--line);border-radius:var(--r-sm);font-family:inherit;direction:ltr;text-align:left;';

    var ctrls = App.el('div', { style: { display: 'none', marginTop: '12px' } }, [
      App.el('label', { style: { fontSize: '13px' } }, 'הסדר החדש של העמודים:'), orderInput
    ]);
    var goBtn = App.el('button', { class: 'btn', style: { display: 'none', marginTop: '12px' }, onClick: doReorder }, '🔀 סדר מחדש והורד');

    var dz = window.PdfOps.dropzone({ icon: '🔀', title: 'גרור PDF לסידור עמודים מחדש', sub: 'קבע סדר חדש, השמט או שכפל עמודים', onFiles: function (fl) { loadFile(fl[0]); } });

    // "3,1,5-7" → [2,0,4,5,6] — שומר סדר, מרשה כפילויות, טווח יורד (7-5) הופך
    function parseOrder(str, max) {
      var out = [];
      (str || '').split(',').forEach(function (part) {
        part = part.trim(); if (!part) return;
        var m = part.match(/^(\d+)\s*-\s*(\d+)$/);
        if (m) {
          var a = +m[1], b = +m[2], step = a <= b ? 1 : -1;
          for (var i = a; step > 0 ? i <= b : i >= b; i += step) if (i >= 1 && i <= max) out.push(i - 1);
        } else { var n = +part; if (n >= 1 && n <= max) out.push(n - 1); }
      });
      return out;
    }

    async function loadFile(f) {
      if (!f) return; file = f;
      try {
        var PDFLib = await window.PdfOps.ensureLib();
        var d = await PDFLib.PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
        pageCount = d.getPageCount();
        orderInput.value = Array.from({ length: pageCount }, function (_, i) { return i + 1; }).join(',');
        window.PdfOps.setStatus(status, '✓ ' + f.name + ' — ' + pageCount + ' עמודים. ערוך את הרצף:', 'ok');
        ctrls.style.display = 'block'; goBtn.style.display = 'inline-block';
      } catch (e) { window.PdfOps.setStatus(status, 'שגיאה בטעינה: ' + (e && e.message || ''), 'err'); }
    }

    async function doReorder() {
      var order = parseOrder(orderInput.value, pageCount);
      if (!order.length) { window.PdfOps.setStatus(status, 'רצף לא תקין', 'err'); return; }
      goBtn.disabled = true; var t0 = goBtn.textContent; goBtn.textContent = '⏳ מסדר…';
      try {
        var PDFLib = await window.PdfOps.ensureLib();
        var src = await PDFLib.PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
        var out = await PDFLib.PDFDocument.create();
        var copied = await out.copyPages(src, order);
        copied.forEach(function (p) { out.addPage(p); });
        window.PdfOps.download(await out.save(), file.name.replace(/\.pdf$/i, '') + '-מסודר.pdf');
        window.PdfOps.setStatus(status, '✓ נוצר PDF עם ' + order.length + ' עמודים בסדר החדש — הורד', 'ok');
      } catch (e) { console.error('[pdf-reorder]', e); window.PdfOps.setStatus(status, 'שגיאה: ' + (e && e.message || ''), 'err'); }
      finally { goBtn.disabled = false; goBtn.textContent = t0; }
    }

    return App.el('div', { class: 'card' }, [
      App.el('div', { class: 'row row-between', style: { marginBottom: '16px' } },
        [App.el('h2', {}, '🔀  סדר עמודים מחדש'), App.el('span', { class: 'chip lavender' }, 'שנה סדר, השמט או שכפל עמודים')]),
      dz.input, dz.zone, status, ctrls, goBtn,
      App.el('p', { style: { fontSize: '12px', color: 'var(--ink-mute)', margin: '10px 0 0' } }, '🔒 רץ מקומית — הקובץ לא עולה לשרת.')
    ]);
  }
  window.Tools = window.Tools || {};
  window.Tools.pdfReorder = buildPdfReorder;
})();
