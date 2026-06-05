(function () {
  // PDF → JPG — render each page to a JPG image. Single page downloads directly;
  // multi-page is zipped (JSZip). 100% local (pdf.js render + canvas).
  function initPdfJs() {
    if (!window.pdfjsLib) return;
    var base = location.href.replace(/#.*/, '').replace(/index\.html.*/, '');
    pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'js/vendor/pdfjs.worker.min.js';
  }
  function buildPdfToJpg() {
    var file = null;
    var status = window.PdfOps.statusEl();
    var bar = App.el('div', { style: { height: '4px', background: 'var(--lavender)', borderRadius: '2px', width: '0', transition: 'width 300ms', marginTop: '10px' } });
    var goBtn = App.el('button', { class: 'btn', style: { display: 'none', marginTop: '12px', padding: '10px 20px', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontWeight: 600 }, onClick: doConvert }, '🖼️ המר והורד');

    var dz = window.PdfOps.dropzone({ icon: '🖼️', title: 'גרור קובץ PDF', sub: 'כל עמוד יומר לתמונת JPG', onFiles: function (fl) {
      file = fl[0]; window.PdfOps.setStatus(status, '✓ ' + file.name + ' נבחר', 'ok'); goBtn.style.display = 'inline-block';
    } });

    async function doConvert() {
      if (!file || !window.pdfjsLib) { window.PdfOps.setStatus(status, 'ספריית PDF לא נטענה', 'err'); return; }
      initPdfJs();
      goBtn.disabled = true; var t = goBtn.textContent; goBtn.textContent = '⏳ ממיר…';
      try {
        var pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        var n = pdf.numPages, base = file.name.replace(/\.pdf$/i, ''), jpgs = [];
        for (var i = 1; i <= n; i++) {
          var page = await pdf.getPage(i);
          var vp = page.getViewport({ scale: 2 });
          var c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
          var ctx = c.getContext('2d', { alpha: false }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
          var blob = await new Promise(function (res) { c.toBlob(res, 'image/jpeg', 0.92); });
          jpgs.push({ name: base + '-' + String(i).padStart(2, '0') + '.jpg', blob: blob });
          page.cleanup && page.cleanup();
          bar.style.width = Math.round(i / n * 100) + '%';
          window.PdfOps.setStatus(status, 'מעבד עמוד ' + i + ' / ' + n + '…');
        }
        if (jpgs.length === 1) {
          window.PdfOps.download(jpgs[0].blob, jpgs[0].name, 'image/jpeg');
        } else {
          var JSZip = await window.PdfOps.ensureZip();
          var zip = new JSZip();
          jpgs.forEach(function (j) { zip.file(j.name, j.blob); });
          var zb = await zip.generateAsync({ type: 'blob' });
          window.PdfOps.download(zb, base + '-jpg.zip', 'application/zip');
        }
        window.PdfOps.setStatus(status, '✓ הומרו ' + n + ' עמודים ל-JPG — הורד' + (n > 1 ? ' (zip)' : ''), 'ok');
      } catch (e) { console.error('[pdf2jpg]', e); window.PdfOps.setStatus(status, 'שגיאה: ' + (e && e.message || ''), 'err'); }
      finally { goBtn.disabled = false; goBtn.textContent = t; }
    }

    return App.el('div', { class: 'card' }, [
      App.el('div', { class: 'row row-between', style: { marginBottom: '16px' } },
        [App.el('h2', {}, '🖼️  PDF ל-JPG'), App.el('span', { class: 'chip lavender' }, 'כל עמוד לתמונת JPG')]),
      dz.input, dz.zone, status, bar, goBtn,
      App.el('p', { style: { fontSize: '12px', color: 'var(--ink-mute)', margin: '10px 0 0', lineHeight: '1.6' } }, '🔒 רץ מקומית — הקובץ לא עולה לשרת. כמה עמודים → קובץ zip.')
    ]);
  }
  window.Tools = window.Tools || {};
  window.Tools.pdfToJpg = buildPdfToJpg;
})();
