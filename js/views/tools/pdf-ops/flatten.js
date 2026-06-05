(function () {
  // Flatten PDF — bake interactive form fields into the page so they can't be
  // edited (and render consistently everywhere). 100% local (pdf-lib form.flatten).
  function buildPdfFlatten() {
    var file = null;
    var status = window.PdfOps.statusEl();
    var goBtn = App.el('button', { class: 'btn', style: { display: 'none', marginTop: '12px', padding: '10px 20px', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontWeight: 600 }, onClick: doFlatten }, '📑 שטח והורד');

    var dz = window.PdfOps.dropzone({ icon: '📑', title: 'גרור קובץ PDF עם טופס', sub: 'השדות יקובעו (לא ניתנים לעריכה)', onFiles: function (fl) {
      file = fl[0]; window.PdfOps.setStatus(status, '✓ ' + file.name + ' נבחר', 'ok'); goBtn.style.display = 'inline-block';
    } });

    async function doFlatten() {
      if (!file) return;
      goBtn.disabled = true; var t = goBtn.textContent; goBtn.textContent = '⏳ משטח…';
      try {
        var PDFLib = await window.PdfOps.ensureLib();
        var doc = await PDFLib.PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
        var hadForm = false;
        try { var form = doc.getForm(); if (form && form.getFields().length) { hadForm = true; form.flatten(); } } catch (e) { /* no form */ }
        var bytes = await doc.save();
        window.PdfOps.download(bytes, file.name.replace(/\.pdf$/i, '') + '-משוטח.pdf');
        window.PdfOps.setStatus(status, hadForm ? '✓ הטופס שוטח — השדות קובעו. הורד' : '✓ הקובץ נשמר (לא נמצאו שדות טופס). הורד', 'ok');
      } catch (e) { console.error('[pdf-flatten]', e); window.PdfOps.setStatus(status, 'שגיאה: ' + (e && e.message || ''), 'err'); }
      finally { goBtn.disabled = false; goBtn.textContent = t; }
    }

    return App.el('div', { class: 'card' }, [
      App.el('div', { class: 'row row-between', style: { marginBottom: '16px' } },
        [App.el('h2', {}, '📑  שטח טופס'), App.el('span', { class: 'chip lavender' }, 'קבע שדות טופס ב-PDF')]),
      dz.input, dz.zone, status, goBtn,
      App.el('p', { style: { fontSize: '12px', color: 'var(--ink-mute)', margin: '10px 0 0', lineHeight: '1.6' } }, '🔒 רץ מקומית — הקובץ לא עולה לשרת.')
    ]);
  }
  window.Tools = window.Tools || {};
  window.Tools.pdfFlatten = buildPdfFlatten;
})();
