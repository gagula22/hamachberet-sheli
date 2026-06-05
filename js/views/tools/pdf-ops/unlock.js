(function () {
  // Unlock PDF — remove owner restrictions / encryption by re-saving the PDF
  // unencrypted. Works for owner-locked (print/copy-restricted) PDFs. A file that
  // needs a PASSWORD JUST TO OPEN cannot be unlocked without that password.
  // 100% local (pdf-lib load {ignoreEncryption} + save).
  function buildPdfUnlock() {
    var file = null;
    var status = window.PdfOps.statusEl();
    var goBtn = App.el('button', { class: 'btn', style: { display: 'none', marginTop: '12px', padding: '10px 20px', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontWeight: 600 }, onClick: doUnlock }, '🔓 בטל נעילה והורד');

    var dz = window.PdfOps.dropzone({ icon: '🔓', title: 'גרור קובץ PDF נעול', sub: 'הסרת הגבלות הדפסה/העתקה', onFiles: function (fl) {
      file = fl[0]; window.PdfOps.setStatus(status, '✓ ' + file.name + ' נבחר', 'ok'); goBtn.style.display = 'inline-block';
    } });

    async function doUnlock() {
      if (!file) return;
      goBtn.disabled = true; var t = goBtn.textContent; goBtn.textContent = '⏳ מבטל…';
      try {
        var PDFLib = await window.PdfOps.ensureLib();
        var doc = await PDFLib.PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
        var bytes = await doc.save();          // re-saved WITHOUT encryption/restrictions
        window.PdfOps.download(bytes, file.name.replace(/\.pdf$/i, '') + '-לא-נעול.pdf');
        window.PdfOps.setStatus(status, '✓ ההגבלות הוסרו — הורד', 'ok');
      } catch (e) {
        console.error('[pdf-unlock]', e);
        var msg = /password|encrypt/i.test(e && e.message || '')
          ? 'הקובץ דורש סיסמה כדי להיפתח — לא ניתן לבטל בלי הסיסמה.'
          : 'שגיאה: ' + (e && e.message || '');
        window.PdfOps.setStatus(status, msg, 'err');
      } finally { goBtn.disabled = false; goBtn.textContent = t; }
    }

    return App.el('div', { class: 'card' }, [
      App.el('div', { class: 'row row-between', style: { marginBottom: '16px' } },
        [App.el('h2', {}, '🔓  בטל נעילה'), App.el('span', { class: 'chip lavender' }, 'הסר הגבלות הדפסה/העתקה')]),
      dz.input, dz.zone, status, goBtn,
      App.el('p', { style: { fontSize: '12px', color: 'var(--ink-mute)', margin: '10px 0 0', lineHeight: '1.6' } }, '🔒 רץ מקומית. מסיר הגבלות בעלים (הדפסה/העתקה). קובץ שדורש סיסמה לפתיחה — אי אפשר בלי הסיסמה.')
    ]);
  }
  window.Tools = window.Tools || {};
  window.Tools.pdfUnlock = buildPdfUnlock;
})();
