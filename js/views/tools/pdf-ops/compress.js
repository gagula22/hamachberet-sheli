(function () {
  // Compress PDF — rasterize each page to a JPEG at a chosen quality/scale and
  // rebuild the PDF. Best for SCANNED / image-heavy PDFs (shrinks a lot). Note:
  // it rasterizes, so text stops being selectable. 100% local (pdf.js + pdf-lib).
  function initPdfJs() {
    if (!window.pdfjsLib) return;
    var base = location.href.replace(/#.*/, '').replace(/index\.html.*/, '');
    pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'js/vendor/pdfjs.worker.min.js';
  }
  function buildPdfCompress() {
    var file = null, preset = { q: 0.6, scale: 1.5, name: 'בינונית' };
    var status = window.PdfOps.statusEl();
    var bar = App.el('div', { style: { height: '4px', background: 'var(--lavender)', borderRadius: '2px', width: '0', transition: 'width 300ms', marginTop: '10px' } });

    var presets = [
      { q: 0.45, scale: 1.0, name: 'חזקה (קטן ביותר)' },
      { q: 0.6, scale: 1.5, name: 'בינונית' },
      { q: 0.82, scale: 2.0, name: 'עדינה (איכות גבוהה)' }
    ];
    var qWrap = App.el('div', { style: { display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' } });
    presets.forEach(function (p) {
      var b = App.el('button', { style: qBtn(p.name === preset.name), onClick: function () { preset = p; refresh(); } }, p.name);
      b._n = p.name; qWrap.appendChild(b);
    });
    function qBtn(on) { return { padding: '8px 12px', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', fontSize: '12px', border: '1px solid ' + (on ? 'var(--ink)' : 'var(--line)'), background: on ? '#fff' : 'var(--cream)' }; }
    function refresh() { Array.from(qWrap.children).forEach(function (b) { var on = b._n === preset.name; b.style.border = '1px solid ' + (on ? 'var(--ink)' : 'var(--line)'); b.style.background = on ? '#fff' : 'var(--cream)'; }); }

    var ctrls = App.el('div', { style: { display: 'none', marginTop: '12px' } },
      [App.el('label', { style: { fontSize: '13px', color: 'var(--ink)' } }, 'רמת דחיסה:'), qWrap]);
    var goBtn = App.el('button', { class: 'btn', style: { display: 'none', marginTop: '12px', padding: '10px 20px', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontWeight: 600 }, onClick: doCompress }, '🗜️ דחס והורד');

    var dz = window.PdfOps.dropzone({ icon: '🗜️', title: 'גרור קובץ PDF לדחיסה', sub: 'מתאים במיוחד ל-PDF סרוקים/כבדים', onFiles: function (fl) {
      file = fl[0]; window.PdfOps.setStatus(status, '✓ ' + file.name + ' (' + Math.round(file.size / 1024) + 'KB). בחר רמה:', 'ok'); ctrls.style.display = 'block'; goBtn.style.display = 'inline-block';
    } });

    async function doCompress() {
      if (!file || !window.pdfjsLib) { window.PdfOps.setStatus(status, 'ספריית PDF לא נטענה', 'err'); return; }
      initPdfJs();
      goBtn.disabled = true; var t = goBtn.textContent; goBtn.textContent = '⏳ דוחס…';
      try {
        var ab0 = await file.arrayBuffer();
        var pdf = await pdfjsLib.getDocument({ data: ab0 }).promise;
        var PDFLib = await window.PdfOps.ensureLib();
        var out = await PDFLib.PDFDocument.create();
        var n = pdf.numPages;
        for (var i = 1; i <= n; i++) {
          var page = await pdf.getPage(i);
          var ptVp = page.getViewport({ scale: 1 });
          var vp = page.getViewport({ scale: preset.scale });
          var c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
          var ctx = c.getContext('2d', { alpha: false }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
          var blob = await new Promise(function (res) { c.toBlob(res, 'image/jpeg', preset.q); });
          var jimg = await out.embedJpg(await blob.arrayBuffer());
          var pg = out.addPage([ptVp.width, ptVp.height]);
          pg.drawImage(jimg, { x: 0, y: 0, width: ptVp.width, height: ptVp.height });
          page.cleanup && page.cleanup();
          bar.style.width = Math.round(i / n * 100) + '%';
          window.PdfOps.setStatus(status, 'דוחס עמוד ' + i + ' / ' + n + '…');
        }
        var bytes = await out.save();
        var before = file.size, after = bytes.length, pct = Math.round((1 - after / before) * 100);
        window.PdfOps.download(bytes, file.name.replace(/\.pdf$/i, '') + '-דחוס.pdf');
        window.PdfOps.setStatus(status, pct > 0
          ? '✓ נדחס מ-' + Math.round(before / 1024) + 'KB ל-' + Math.round(after / 1024) + 'KB (חיסכון ' + pct + '%) — הורד'
          : '✓ הומר (' + Math.round(after / 1024) + 'KB) — הורד. ל-PDF טקסטואלי דחיסה לא תמיד עוזרת.', 'ok');
      } catch (e) { console.error('[pdf-compress]', e); window.PdfOps.setStatus(status, 'שגיאה: ' + (e && e.message || ''), 'err'); }
      finally { goBtn.disabled = false; goBtn.textContent = t; }
    }

    return App.el('div', { class: 'card' }, [
      App.el('div', { class: 'row row-between', style: { marginBottom: '16px' } },
        [App.el('h2', {}, '🗜️  דחס PDF'), App.el('span', { class: 'chip lavender' }, 'הקטן קבצים סרוקים/כבדים')]),
      dz.input, dz.zone, status, bar, ctrls, goBtn,
      App.el('p', { style: { fontSize: '12px', color: 'var(--ink-mute)', margin: '10px 0 0', lineHeight: '1.6' } }, '🔒 רץ מקומית. הדחיסה ממירה עמודים לתמונות (טקסט לא יהיה בר-בחירה) — מתאימה לסריקות/PDF עם תמונות.')
    ]);
  }
  window.Tools = window.Tools || {};
  window.Tools.pdfCompress = buildPdfCompress;
})();
