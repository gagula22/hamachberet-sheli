(function () {
  // PDF סרוק/תמונה → Word נערך via OCR (Tesseract.js, Hebrew+English). 100% local:
  // Tesseract engine + lang data are VENDORED in js/vendor/tesseract (no CDN, no
  // upload). Renders each page, OCRs it, and builds an editable .doc — optionally
  // with the page image too (text for editing + image for fidelity).
  function base() { return location.href.replace(/#.*/, '').replace(/index\.html.*/, ''); }
  function initPdfJs() { if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = base() + 'js/vendor/pdfjs.worker.min.js'; }
  var _tp = null;
  function ensureTesseract() {
    if (window.Tesseract) return Promise.resolve();
    if (_tp) return _tp;
    _tp = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = base() + 'js/vendor/tesseract/tesseract.min.js';
      s.onload = function () { window.Tesseract ? res() : rej(new Error('Tesseract missing')); };
      s.onerror = function () { rej(new Error('tesseract load failed')); };
      document.head.appendChild(s);
    });
    return _tp;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function buildPdfOcr() {
    var file = null;
    var status = window.PdfOps.statusEl();
    var bar = App.el('div', { style: { height: '4px', background: 'var(--lavender)', borderRadius: '2px', width: '0', transition: 'width 300ms', marginTop: '10px' } });

    var incImg = document.createElement('input');
    incImg.type = 'checkbox'; incImg.checked = true; incImg.style.cssText = 'margin:0;cursor:pointer;width:16px;height:16px;';
    var incLbl = App.el('label', { style: { display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', marginTop: '12px', cursor: 'pointer' } },
      [incImg, App.el('span', {}, 'כלול גם את תמונת העמוד (טקסט לעריכה + מראה נאמן)')]);

    var goBtn = App.el('button', { class: 'btn', style: { display: 'none', marginTop: '12px', padding: '10px 20px', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontWeight: 600 }, onClick: doOcr }, '🔍 חלץ טקסט (OCR) והורד');

    var dz = window.PdfOps.dropzone({ icon: '🔍', title: 'גרור PDF סרוק / מבוסס-תמונה', sub: 'OCR עברית+אנגלית → טקסט נערך', onFiles: function (fl) {
      file = fl[0]; window.PdfOps.setStatus(status, '✓ ' + file.name + ' נבחר', 'ok'); goBtn.style.display = 'inline-block';
    } });

    async function doOcr() {
      if (!file || !window.pdfjsLib) { window.PdfOps.setStatus(status, 'ספריית PDF לא נטענה', 'err'); return; }
      initPdfJs();
      goBtn.disabled = true; var t = goBtn.textContent; goBtn.textContent = '⏳ מריץ OCR…';
      var worker = null;
      try {
        window.PdfOps.setStatus(status, 'טוען מנוע OCR (פעם ראשונה — כמה שניות)…');
        await ensureTesseract();
        var b = base() + 'js/vendor/tesseract/';
        worker = await Tesseract.createWorker('heb+eng', 1, { workerPath: b + 'worker.min.js', corePath: b, langPath: b });
        var pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        var n = pdf.numPages, html = '', incImage = incImg.checked;
        for (var i = 1; i <= n; i++) {
          var page = await pdf.getPage(i);
          var vp = page.getViewport({ scale: 2.4 });   // higher scale = better OCR
          var c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
          var ctx = c.getContext('2d', { alpha: false }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
          window.PdfOps.setStatus(status, '🔍 OCR עמוד ' + i + ' / ' + n + '…');
          var res = await worker.recognize(c);
          var text = (res.data && res.data.text || '').trim();
          if (incImage) {
            var src = c.toDataURL('image/jpeg', 0.7);
            var dw = 620, dh = Math.max(80, Math.round(dw * c.height / c.width));
            html += '<table border="0" cellpadding="0" cellspacing="0" align="center" width="100%" style="border-collapse:collapse;margin:8px 0;page-break-inside:avoid;">' +
                    '<tr><td align="center"><img width="' + dw + '" height="' + dh + '" src="' + src + '" style="display:block;margin:0 auto;" /></td></tr></table>';
          }
          text.split(/\n+/).forEach(function (line) {
            line = line.trim();
            if (line) html += '<p dir="rtl" style="unicode-bidi:plaintext;direction:rtl;text-align:right;line-height:1.6;margin:0 0 6px;">' + esc(line) + '</p>';
          });
          if (i < n) html += '<br clear="all" style="mso-special-character:line-break;page-break-before:always" />';
          page.cleanup && page.cleanup();
          bar.style.width = Math.round(i / n * 100) + '%';
        }
        await worker.terminate(); worker = null;
        var title = esc(file.name.replace(/\.pdf$/i, ''));
        var doc = [
          "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40' lang='he' dir='rtl'>",
          "<head><meta charset='utf-8'><title>" + title + "</title>",
          "<style>@page Section1{size:595.3pt 841.9pt;margin:1.5cm 1cm;}div.Section1{page:Section1;}",
          "body{font-family:Arial,'David',sans-serif;font-size:12pt;direction:rtl;text-align:right;}",
          "p{unicode-bidi:plaintext;direction:rtl;text-align:right;} img{max-width:100%;height:auto;}</style></head>",
          "<body lang='he' dir='rtl'><div class='Section1'>", html, "</div></body></html>"
        ].join('');
        var blob = new Blob(['﻿', doc], { type: 'application/msword' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a'); a.href = url; a.download = file.name.replace(/\.pdf$/i, '') + ' - OCR.doc'; a.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        window.PdfOps.setStatus(status, '✓ OCR הושלם — ' + n + ' עמודים כטקסט נערך. הורד', 'ok');
      } catch (e) {
        console.error('[pdf-ocr]', e);
        if (worker) { try { await worker.terminate(); } catch (e2) {} }
        window.PdfOps.setStatus(status, 'שגיאה ב-OCR: ' + (e && e.message ? e.message : ''), 'err');
      } finally { goBtn.disabled = false; goBtn.textContent = t; }
    }

    return App.el('div', { class: 'card' }, [
      App.el('div', { class: 'row row-between', style: { marginBottom: '16px' } },
        [App.el('h2', {}, '🔍  PDF סרוק ל-Word (OCR)'), App.el('span', { class: 'chip lavender' }, 'טקסט נערך מסריקה/תמונה')]),
      dz.input, dz.zone, incLbl, status, bar, goBtn,
      App.el('p', { style: { fontSize: '12px', color: 'var(--ink-mute)', margin: '10px 0 0', lineHeight: '1.6' } },
        '🔒 רץ מקומית (Tesseract מאורז אצלך) — הקובץ לא עולה לשום שרת. עברית+אנגלית. האיכות תלויה באיכות הסריקה. מתאים ל-PDF שאין בו טקסט (סרוק/תמונה).')
    ]);
  }
  window.Tools = window.Tools || {};
  window.Tools.pdfOcr = buildPdfOcr;
})();
