(function () {
  // Delete pages — remove specified pages, keep the rest → new PDF. Local.
  function buildPdfDelete() {
    var file = null, pageCount = 0;
    var status = window.PdfOps.statusEl();
    var rangeInput = document.createElement('input');
    rangeInput.type = 'text'; rangeInput.placeholder = 'למשל 2,5-7';
    rangeInput.style.cssText = 'width:100%;margin-top:6px;padding:9px 12px;border:1px solid var(--line);border-radius:var(--r-sm);font-family:inherit;direction:ltr;text-align:left;';
    var ctrls = App.el('div', { style: { display: 'none', marginTop: '12px' } },
      [App.el('label', { style: { fontSize: '13px', color: 'var(--ink)' } }, 'דפים למחיקה:'), rangeInput]);
    var goBtn = App.el('button', { class: 'btn', style: { display: 'none', marginTop: '12px', padding: '10px 20px', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontWeight: 600 }, onClick: doDelete }, '🗑️ מחק והורד');

    var dz = window.PdfOps.dropzone({ icon: '🗑️', title: 'גרור קובץ PDF', sub: 'בחר אילו דפים למחוק', onFiles: function (fl) { loadFile(fl[0]); } });

    async function loadFile(f) {
      if (!f) return; file = f;
      try {
        var PDFLib = await window.PdfOps.ensureLib();
        var d = await PDFLib.PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
        pageCount = d.getPageCount();
        window.PdfOps.setStatus(status, '✓ ' + f.name + ' — ' + pageCount + ' עמודים. הזן דפים למחיקה:', 'ok');
        ctrls.style.display = 'block'; goBtn.style.display = 'inline-block';
      } catch (e) { window.PdfOps.setStatus(status, 'שגיאה בטעינה: ' + (e && e.message || ''), 'err'); }
    }
    async function doDelete() {
      var del = window.PdfOps.parseRanges(rangeInput.value, pageCount);
      if (!del.length) { window.PdfOps.setStatus(status, 'הזן דפים למחיקה (למשל 2,5-7)', 'err'); return; }
      var delSet = {}; del.forEach(function (i) { delSet[i] = 1; });
      var keep = []; for (var i = 0; i < pageCount; i++) if (!delSet[i]) keep.push(i);
      if (!keep.length) { window.PdfOps.setStatus(status, 'אי אפשר למחוק את כל הדפים', 'err'); return; }
      goBtn.disabled = true; var t = goBtn.textContent; goBtn.textContent = '⏳ מוחק…';
      try {
        var PDFLib = await window.PdfOps.ensureLib();
        var src = await PDFLib.PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
        var out = await PDFLib.PDFDocument.create();
        var cp = await out.copyPages(src, keep); cp.forEach(function (p) { out.addPage(p); });
        window.PdfOps.download(await out.save(), file.name.replace(/\.pdf$/i, '') + '-נמחקו-דפים.pdf');
        window.PdfOps.setStatus(status, '✓ נמחקו ' + del.length + ' דפים, נשארו ' + keep.length + ' — הורד', 'ok');
      } catch (e) { console.error('[pdf-delete]', e); window.PdfOps.setStatus(status, 'שגיאה: ' + (e && e.message || ''), 'err'); }
      finally { goBtn.disabled = false; goBtn.textContent = t; }
    }

    return App.el('div', { class: 'card' }, [
      App.el('div', { class: 'row row-between', style: { marginBottom: '16px' } },
        [App.el('h2', {}, '🗑️  מחק דפים'), App.el('span', { class: 'chip lavender' }, 'הסר דפים מ-PDF')]),
      dz.input, dz.zone, status, ctrls, goBtn,
      App.el('p', { style: { fontSize: '12px', color: 'var(--ink-mute)', margin: '10px 0 0', lineHeight: '1.6' } }, '🔒 רץ מקומית — הקובץ לא עולה לשרת.')
    ]);
  }
  window.Tools = window.Tools || {};
  window.Tools.pdfDelete = buildPdfDelete;
})();
