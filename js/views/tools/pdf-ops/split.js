(function () {
  // Split / extract pages — pick page ranges → new PDF with just those pages. Local.
  function buildPdfSplit() {
    var file = null, pageCount = 0;
    var status = window.PdfOps.statusEl();
    var rangeInput = document.createElement('input');
    rangeInput.type = 'text'; rangeInput.placeholder = 'למשל 1-3,5,8-10';
    rangeInput.style.cssText = 'width:100%;margin-top:6px;padding:9px 12px;border:1px solid var(--line);border-radius:var(--r-sm);font-family:inherit;direction:ltr;text-align:left;';
    var ctrls = App.el('div', { style: { display: 'none', marginTop: '12px' } },
      [App.el('label', { style: { fontSize: '13px', color: 'var(--ink)' } }, 'דפים לחילוץ:'), rangeInput]);
    var goBtn = App.el('button', { class: 'btn', style: { display: 'none', marginTop: '12px', padding: '10px 20px', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontWeight: 600 }, onClick: doSplit }, '✂️ חלץ והורד');

    var dz = window.PdfOps.dropzone({ icon: '✂️', title: 'גרור קובץ PDF לפיצול', sub: 'בחר אילו דפים לחלץ', onFiles: function (fl) { loadFile(fl[0]); } });

    async function loadFile(f) {
      if (!f) return; file = f;
      try {
        var PDFLib = await window.PdfOps.ensureLib();
        var d = await PDFLib.PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
        pageCount = d.getPageCount();
        window.PdfOps.setStatus(status, '✓ ' + f.name + ' — ' + pageCount + ' עמודים. הזן דפים לחילוץ:', 'ok');
        ctrls.style.display = 'block'; goBtn.style.display = 'inline-block';
      } catch (e) { window.PdfOps.setStatus(status, 'שגיאה בטעינה: ' + (e && e.message || ''), 'err'); }
    }
    async function doSplit() {
      var idx = window.PdfOps.parseRanges(rangeInput.value, pageCount);
      if (!idx.length) { window.PdfOps.setStatus(status, 'הזן טווח דפים תקין (למשל 1-3,5)', 'err'); return; }
      goBtn.disabled = true; var t = goBtn.textContent; goBtn.textContent = '⏳ מחלץ…';
      try {
        var PDFLib = await window.PdfOps.ensureLib();
        var src = await PDFLib.PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
        var out = await PDFLib.PDFDocument.create();
        var cp = await out.copyPages(src, idx); cp.forEach(function (p) { out.addPage(p); });
        window.PdfOps.download(await out.save(), file.name.replace(/\.pdf$/i, '') + '-עמודים.pdf');
        window.PdfOps.setStatus(status, '✓ חולצו ' + idx.length + ' דפים — הורד', 'ok');
      } catch (e) { console.error('[pdf-split]', e); window.PdfOps.setStatus(status, 'שגיאה: ' + (e && e.message || ''), 'err'); }
      finally { goBtn.disabled = false; goBtn.textContent = t; }
    }

    return App.el('div', { class: 'card' }, [
      App.el('div', { class: 'row row-between', style: { marginBottom: '16px' } },
        [App.el('h2', {}, '✂️  פצל PDF'), App.el('span', { class: 'chip lavender' }, 'חלץ דפים נבחרים לקובץ חדש')]),
      dz.input, dz.zone, status, ctrls, goBtn,
      App.el('p', { style: { fontSize: '12px', color: 'var(--ink-mute)', margin: '10px 0 0', lineHeight: '1.6' } }, '🔒 רץ מקומית — הקובץ לא עולה לשרת.')
    ]);
  }
  window.Tools = window.Tools || {};
  window.Tools.pdfSplit = buildPdfSplit;
})();
