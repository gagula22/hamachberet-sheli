(function () {
  // Word -> PDF. Converts .doc/.docx to a REAL, auto-downloaded PDF named after
  // the source file — via the shared HTML→PDF engine (window.HtmlToPdf). That
  // engine renders the content full-width and paginates at block boundaries, so
  // images are never cut or pushed past the page edge. (No print dialog.)
  // ── Tool 1: Word → PDF ───────────────────────────────────────────────────
  function buildWordToPdf() {
    let previewHtml = '';
    let srcName = 'document';

    const status   = App.el('p', { style: { margin: '10px 0 0', fontSize: '13px' } });
    const preview  = App.el('div', {
      style: { display: 'none', marginTop: '16px', border: '1px solid var(--line)',
               borderRadius: 'var(--r-md)', padding: '20px', background: '#fff',
               maxHeight: '380px', overflowY: 'auto', unicodeBidi: 'plaintext', lineHeight: '1.7' }
    });
    const exportBtn = App.el('button', {
      class: 'btn',
      style: { display: 'none', marginTop: '12px',
               background: 'var(--blush)', border: '1px solid var(--blush-deep)',
               borderRadius: 'var(--r-sm)', padding: '10px 20px', fontWeight: 600, cursor: 'pointer' },
      onClick: async () => {
        if (!previewHtml) return;
        if (!window.HtmlToPdf) { status.textContent = 'מנוע ה-PDF לא נטען'; status.style.color = '#c00'; return; }
        const origText = exportBtn.textContent;
        exportBtn.disabled = true;
        exportBtn.textContent = '⏳ יוצר PDF…';
        try {
          // dir:'auto' so each paragraph picks its own direction (handles mixed
          // Hebrew/English Word documents correctly).
          await window.HtmlToPdf.generate('', previewHtml, { fileName: srcName, dir: 'auto' });
          status.textContent = '✓ קובץ PDF הורד: ' + srcName + '.pdf';
          status.style.color = 'var(--sage-deep)';
        } catch (e) {
          console.error('[word2pdf]', e);
          status.textContent = 'שגיאה ביצירת ה-PDF';
          status.style.color = '#c00';
        } finally {
          exportBtn.disabled = false;
          exportBtn.textContent = origText;
        }
      }
    }, '📄 ייצוא ל-PDF');

    async function processFile(file) {
      if (!file) return;
      const ext = file.name.split('.').pop().toLowerCase();
      srcName = file.name.replace(/\.(docx?|html?)$/i, '');
      status.textContent = 'טוען קובץ…';
      status.style.color = 'var(--ink-mute)';
      preview.style.display = 'none';
      exportBtn.style.display = 'none';
      try {
        if (ext === 'docx') {
          if (!window.mammoth) throw new Error('mammoth not loaded');
          const ab = await file.arrayBuffer();
          // convertToHtml inlines images as base64 data-URLs by default.
          const res = await mammoth.convertToHtml({ arrayBuffer: ab });
          previewHtml = res.value;
        } else {
          const text = await file.text();
          const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
          previewHtml = bodyMatch ? bodyMatch[1] : `<pre style="white-space:pre-wrap">${text}</pre>`;
        }
        preview.innerHTML = previewHtml;
        preview.style.display = 'block';
        exportBtn.style.display = 'inline-block';
        status.textContent = `✓ ${file.name} נטען`;
        status.style.color = 'var(--sage-deep)';
      } catch (e) {
        status.textContent = 'שגיאה בטעינת הקובץ — ודא שמדובר ב-.docx תקין';
        status.style.color = '#c00';
      }
    }

    const fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.accept = '.doc,.docx'; fileInput.style.display = 'none';
    fileInput.addEventListener('change', () => processFile(fileInput.files[0]));

    const zone = App.el('div', {
      style: { border: '2px dashed var(--line)', borderRadius: 'var(--r-md)',
               padding: '36px 20px', textAlign: 'center', cursor: 'pointer',
               transition: 'all 180ms', background: 'var(--cream)' },
      onClick: () => fileInput.click()
    }, [
      App.el('div', { style: { fontSize: '44px', marginBottom: '8px' } }, '📝'),
      App.el('div', { style: { fontWeight: 600, marginBottom: '4px' } }, 'גרור קובץ Word לכאן'),
      App.el('div', { style: { fontSize: '13px', color: 'var(--ink-mute)' } }, 'או לחץ לבחירה · .doc / .docx')
    ]);
    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.style.borderColor = 'var(--lavender-deep)'; zone.style.background = 'var(--lavender)'; });
    zone.addEventListener('dragleave', ()  => { zone.style.borderColor = 'var(--line)'; zone.style.background = 'var(--cream)'; });
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.style.borderColor = 'var(--line)'; zone.style.background = 'var(--cream)';
      processFile(e.dataTransfer.files[0]);
    });

    return App.el('div', { class: 'card' }, [
      App.el('div', { class: 'row row-between', style: { marginBottom: '16px' } }, [
        App.el('h2', {}, '📝  Word  →  PDF'),
        App.el('span', { class: 'chip lavender' }, 'המר קובץ Word לקובץ PDF')
      ]),
      fileInput, zone, status, preview, exportBtn
    ]);
  }
  window.Tools = window.Tools || {};
  window.Tools.wordToPdf = buildWordToPdf;
})();