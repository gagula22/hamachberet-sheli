(function () {
  // PDF -> Word. Page-faithful strategy: render EACH PDF page to a high-res
  // image via PDF.js and embed those images in the .doc. The result looks
  // EXACTLY like the source PDF — charts, color highlights and hand-drawn marks
  // are preserved perfectly, with no messy heuristic text reconstruction and no
  // broken images. (Tradeoff: text is not selectable/editable — chosen on purpose
  // for visually rich documents.)
  function initPdfJs() {
    if (!window.pdfjsLib) return;
    const base = location.href.replace(/#.*/, '').replace(/index\.html.*/, '');
    pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'js/vendor/pdfjs.worker.min.js';
  }

  function buildPdfToWord() {
    const status = App.el('p', { style: { margin: '10px 0 0', fontSize: '13px', color: 'var(--ink-mute)' } });
    const bar    = App.el('div', {
      style: { height: '4px', background: 'var(--lavender)', borderRadius: '2px',
               width: '0', transition: 'width 300ms', marginTop: '10px' }
    });

    function _escHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    async function processFile(file) {
      if (!file) return;
      if (!window.pdfjsLib) { status.textContent = 'ספריית PDF לא נטענה'; return; }
      initPdfJs();
      status.textContent = 'קורא קובץ PDF…';
      status.style.color = 'var(--ink-mute)';
      bar.style.width = '5%';
      try {
        const ab  = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
        const n   = pdf.numPages;

        // Render every page to an image. 2× device scale → crisp output.
        // Pages are rendered sequentially to keep peak memory low on big PDFs.
        const SCALE = 2;
        const pageImgs = [];
        for (let i = 1; i <= n; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: SCALE });
          const canvas = document.createElement('canvas');
          canvas.width  = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext('2d', { alpha: false });
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: viewport }).promise;
          // JPEG keeps multi-page documents to a sane size; quality 0.85 is sharp.
          pageImgs.push(canvas.toDataURL('image/jpeg', 0.85));
          page.cleanup && page.cleanup();
          bar.style.width = (5 + (i / n) * 80) + '%';
          status.textContent = 'מעבד עמוד ' + i + ' / ' + n + '…';
        }

        status.textContent = 'בונה את מסמך ה-Word…';
        // Each page image fills the A4 content area (1cm margins → ~700px wide),
        // one image per Word page. Word honours the px width attribute (it ignores
        // % on <img>), so the page never overflows.
        const pagesHtml = pageImgs.map((src, idx) => {
          const brk = idx < pageImgs.length - 1 ? 'page-break-after:always;' : '';
          return '<div style="text-align:center;' + brk + '">' +
                 '<img width="700" src="' + src + '" style="width:700px;max-width:100%;height:auto;" />' +
                 '</div>';
        }).join('');

        const titleHtml = _escHtml(file.name.replace(/\.pdf$/i, ''));
        const docHtml = [
          "<html xmlns:o='urn:schemas-microsoft-com:office:office'",
          " xmlns:w='urn:schemas-microsoft-com:office:word'",
          " xmlns='http://www.w3.org/TR/REC-html40'>",
          "<head><meta charset='utf-8'><title>" + titleHtml + "</title>",
          "<style>",
          "  @page Section1 { size:595.3pt 841.9pt; margin:1cm 1cm 1cm 1cm; mso-paper-source:0; }",
          "  div.Section1 { page:Section1; }",
          "  body { margin:0; padding:0; }",
          "  img { max-width:100%; height:auto; }",
          "</style>",
          "</head><body dir='rtl'><div class='Section1'>",
          pagesHtml,
          "</div></body></html>"
        ].join('');

        const blob = new Blob(['﻿', docHtml], { type: 'application/msword' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = file.name.replace(/\.pdf$/i, '.doc'); a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        bar.style.width = '100%';
        status.textContent = '✓ הומרו ' + n + ' עמודים במראה זהה למקור — הורד ' + file.name.replace(/\.pdf$/i, '.doc');
        status.style.color = 'var(--sage-deep)';
      } catch (e) {
        console.error('[pdf2word]', e);
        status.textContent = 'שגיאה: ' + (e && e.message ? e.message : 'לא ניתן לקרוא את ה-PDF') + ' (אולי מוגן בסיסמה?)';
        status.style.color = '#c00';
        bar.style.width = '0';
      }
    }

    const fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.accept = '.pdf'; fileInput.style.display = 'none';
    fileInput.addEventListener('change', () => processFile(fileInput.files[0]));

    const zone = App.el('div', {
      style: { border: '2px dashed var(--line)', borderRadius: 'var(--r-md)',
               padding: '36px 20px', textAlign: 'center', cursor: 'pointer',
               transition: 'all 180ms', background: 'var(--cream)' },
      onClick: () => fileInput.click()
    }, [
      App.el('div', { style: { fontSize: '44px', marginBottom: '8px' } }, '📄'),
      App.el('div', { style: { fontWeight: 600, marginBottom: '4px' } }, 'גרור קובץ PDF לכאן'),
      App.el('div', { style: { fontSize: '13px', color: 'var(--ink-mute)' } }, 'או לחץ לבחירה · .pdf')
    ]);
    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.style.borderColor = 'var(--butter-deep)'; zone.style.background = 'var(--butter)'; });
    zone.addEventListener('dragleave', ()  => { zone.style.borderColor = 'var(--line)'; zone.style.background = 'var(--cream)'; });
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.style.borderColor = 'var(--line)'; zone.style.background = 'var(--cream)';
      processFile(e.dataTransfer.files[0]);
    });

    return App.el('div', { class: 'card' }, [
      App.el('div', { class: 'row row-between', style: { marginBottom: '16px' } }, [
        App.el('h2', {}, '📄  PDF  →  Word'),
        App.el('span', { class: 'chip butter' }, 'המר PDF לקובץ Word במראה זהה')
      ]),
      fileInput, zone, status, bar,
      App.el('p', { style: { fontSize: '12px', color: 'var(--ink-mute)', margin: '10px 0 0', lineHeight: '1.6' } },
        '✨ כל עמוד מומר לתמונה נאמנה למקור — גרפים, הדגשות צבע וסימונים נשמרים בדיוק. (הטקסט אינו ניתן לעריכה — מתאים למסמכים עשירים ויזואלית.)')
    ]);
  }
  window.Tools = window.Tools || {};
  window.Tools.pdfToWord = buildPdfToWord;
})();
