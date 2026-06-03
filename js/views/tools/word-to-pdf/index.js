(function () {
  // Word -> PDF. Extracted from stickers.js (separation of concerns).
  // ── Shared: PDF instruction modal ────────────────────────────────────────
  function showPdfModal(onConfirm) {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:18px;padding:32px 36px;max-width:420px;width:90%;direction:rtl;font-family:inherit;box-shadow:0 20px 60px rgba(0,0,0,.3);">
        <div style="font-size:36px;text-align:center;margin-bottom:12px;">📄</div>
        <h2 style="margin:0 0 16px;font-size:20px;text-align:center;">ייצוא ל-PDF</h2>
        <p style="color:var(--ink-soft);margin:0 0 14px;font-size:14px;line-height:1.6;">בחלון ההדפסה שייפתח:</p>
        <ol style="margin:0 0 20px;padding-right:20px;font-size:14px;line-height:2.2;">
          <li>לחץ על <strong>"יעד"</strong> (Destination)</li>
          <li>בחר <strong>"שמור כ-PDF"</strong> או <strong>"Microsoft Print to PDF"</strong></li>
          <li>לחץ <strong>"שמור"</strong></li>
        </ol>
        <button id="tools-pdf-go" style="width:100%;padding:13px;background:linear-gradient(135deg,#FADADD,#E6DDF4);border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;color:#3b3a3a;">
          הבנתי — פתח חלון הדפסה ▶
        </button>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('tools-pdf-go').addEventListener('click', () => {
      modal.remove();
      setTimeout(onConfirm, 150);
    });
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  }
  // ── Tool 1: Word → PDF ───────────────────────────────────────────────────
  function buildWordToPdf() {
    let previewHtml = '';

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
      onClick: () => {
        const pid = 'tools-pdf-' + Date.now();
        const div = document.createElement('div');
        div.id = pid; div.setAttribute('dir', 'auto'); div.style.display = 'none';
        div.innerHTML = previewHtml;
        const st = document.createElement('style');
        st.textContent = `
          @media print {
            body > *:not(#${pid}) { display:none !important; }
            #${pid} { display:block !important; direction:auto;
                      font-family:Arial,"Times New Roman",serif; color:#000; line-height:1.7; }
            #${pid} img { max-width:100%; }
            #${pid} p, #${pid} li, #${pid} td, #${pid} th { unicode-bidi:plaintext; }
            @page { margin:15mm; size:A4; }
          }`;
        document.head.appendChild(st);
        document.body.appendChild(div);
        showPdfModal(() => {
          window.print();
          setTimeout(() => { st.remove(); div.remove(); }, 1500);
        });
      }
    }, '📄 ייצוא ל-PDF');

    async function processFile(file) {
      if (!file) return;
      const ext = file.name.split('.').pop().toLowerCase();
      status.textContent = 'טוען קובץ…';
      status.style.color = 'var(--ink-mute)';
      preview.style.display = 'none';
      exportBtn.style.display = 'none';
      try {
        if (ext === 'docx') {
          if (!window.mammoth) throw new Error('mammoth not loaded');
          const ab = await file.arrayBuffer();
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