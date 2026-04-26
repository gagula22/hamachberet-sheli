(function () {

  // ── PDF.js worker (local bundle) ─────────────────────────────────────────
  function initPdfJs() {
    if (!window.pdfjsLib) return;
    const base = location.href.replace(/#.*/, '').replace(/index\.html.*/, '');
    pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'js/vendor/pdfjs.worker.min.js';
  }

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
        div.id = pid;
        div.setAttribute('dir', 'auto');
        div.style.display = 'none';
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

  // ── Tool 2: PDF → Word ───────────────────────────────────────────────────
  function buildPdfToWord() {
    const status = App.el('p', { style: { margin: '10px 0 0', fontSize: '13px', color: 'var(--ink-mute)' } });
    const bar    = App.el('div', {
      style: { height: '4px', background: 'var(--lavender)', borderRadius: '2px',
               width: '0', transition: 'width 300ms', marginTop: '10px' }
    });

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
        let html  = '';
        for (let i = 1; i <= n; i++) {
          bar.style.width = (5 + (i / n) * 85) + '%';
          const page    = await pdf.getPage(i);
          const content = await page.getTextContent();
          const text    = content.items.map(it => it.str).join(' ');
          html += `<h3 style="margin:18px 0 6px;">עמוד ${i}</h3><p style="white-space:pre-wrap;direction:auto;line-height:1.8;">${text}</p><hr style="border:none;border-top:1px solid #eee;margin:12px 0;">`;
        }
        bar.style.width = '100%';
        const docHtml = [
          `<html xmlns:o='urn:schemas-microsoft-com:office:office'`,
          ` xmlns:w='urn:schemas-microsoft-com:office:word'`,
          ` xmlns='http://www.w3.org/TR/REC-html40'>`,
          `<head><meta charset='utf-8'><title>${file.name}</title>`,
          `<style>body{font-family:Arial,"Times New Roman",serif;padding:40px;max-width:820px;margin:0 auto;}`,
          `p,h1,h2,h3,li{unicode-bidi:plaintext;direction:auto;}</style>`,
          `</head><body dir="auto">`,
          `<h1 style="font-size:24px;margin-bottom:20px;unicode-bidi:plaintext;direction:auto;">${file.name.replace(/\.pdf$/i, '')}</h1>`,
          html, `</body></html>`
        ].join('');
        const blob = new Blob(['﻿', docHtml], { type: 'application/msword' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = file.name.replace(/\.pdf$/i, '.doc'); a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        status.textContent = `✓ חולץ טקסט מ-${n} עמודים — הורד ${file.name.replace(/\.pdf$/i, '.doc')}`;
        status.style.color = 'var(--sage-deep)';
      } catch (e) {
        status.textContent = 'שגיאה בקריאת ה-PDF — ייתכן שהוא מוגן בסיסמה';
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
        App.el('span', { class: 'chip butter' }, 'חלץ טקסט מ-PDF לקובץ Word')
      ]),
      fileInput, zone, status, bar,
      App.el('p', { style: { fontSize: '12px', color: 'var(--ink-mute)', margin: '10px 0 0', lineHeight: '1.6' } },
        '⚠️ הערה: הכלי חולץ טקסט בלבד — עיצוב מורכב ותמונות לא ישמרו')
    ]);
  }

  // ── Tool 3: PDF → עברית ──────────────────────────────────────────────────
  // מודל NLLB-200 (Meta AI) — פועל 100% בדפדפן, ללא עלות לתמיד
  // ללא שרת · ללא מפתח API · תומך 200 שפות
  // תמונות + עיצוב נשמרים (כל עמוד מרונדר כתמונה מלאה)
  // ניהול זיכרון: פינוי אוטומטי לאחר שמירה
  function buildPdfTranslator() {
    const MAX_FILE   = 500 * 1024 * 1024;  // 500 MB
    const PAGE_SCALE = 1.5;                // render DPI (108 equivalent)
    const JPEG_Q     = 0.80;               // JPEG quality — balance size/clarity
    const MAX_CHUNK  = 380;                // chars per model inference call

    // ── text helpers ─────────────────────────────────────────────────────────
    function esc(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Split long text into sentence-aware chunks that fit the model's context
    function splitChunks(text) {
      if (!text.trim()) return [];
      if (text.length <= MAX_CHUNK) return [text.trim()];
      const parts = [];
      let pos = 0;
      while (pos < text.length) {
        let end = pos + MAX_CHUNK;
        if (end >= text.length) { parts.push(text.slice(pos).trim()); break; }
        // Seek back to sentence boundary within last 120 chars
        let cut = -1;
        for (let i = end; i > end - 120 && i > pos; i--) {
          if ('.!?\n'.includes(text[i])) { cut = i + 1; break; }
        }
        // Fall back: word boundary
        if (cut === -1) {
          for (let i = end; i > end - 60 && i > pos; i--) {
            if (text[i] === ' ') { cut = i; break; }
          }
        }
        if (cut === -1) cut = end;
        const chunk = text.slice(pos, cut).trim();
        if (chunk) parts.push(chunk);
        pos = cut;
      }
      return parts;
    }

    // ── Transformers.js model — loaded once, cached in browser ───────────────
    // Singleton promise: never loads the model twice, survives re-renders
    // because it lives on the outer IIFE scope
    let _pipePromise = null;

    function getPipeline(onProgress) {
      if (!_pipePromise) {
        _pipePromise = (async () => {
          // Dynamic import — works from regular <script>, no bundler needed
          const { pipeline, env } = await import(
            'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2'
          );
          env.allowLocalModels = false;
          env.useBrowserCache  = true;  // cache ONNX weights in IndexedDB
          // NLLB-200 distilled 600M — verified public ONNX model, supports 200 languages
          // quantized=true → uses int8 ONNX (~150MB instead of ~600MB)
          return await pipeline('translation', 'Xenova/nllb-200-distilled-600M', {
            quantized: true,
            progress_callback: onProgress
          });
        })();
        _pipePromise.catch(() => { _pipePromise = null; }); // allow retry on failure
      }
      return _pipePromise;
    }

    async function translatePageText(pipe, text) {
      if (!text.trim()) return '';
      const chunks  = splitChunks(text);
      if (!chunks.length) return '';
      // NLLB requires explicit source/target language codes
      const outputs = await pipe(chunks, {
        src_lang: 'eng_Latn',   // English (Latin script)
        tgt_lang: 'heb_Hebr',   // Hebrew (Hebrew script)
        max_new_tokens: 512
      });
      return outputs.map(o => o.translation_text).join(' ');
    }

    // ── Render PDF page → JPEG data-URL (preserves images + layout) ──────────
    async function renderPageImg(page) {
      const vp  = page.getViewport({ scale: PAGE_SCALE });
      const cv  = document.createElement('canvas');
      cv.width  = Math.round(vp.width);
      cv.height = Math.round(vp.height);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const dataUrl = cv.toDataURL('image/jpeg', JPEG_Q);
      // ── free canvas memory immediately ──
      cv.width = 1; cv.height = 1;
      return dataUrl;
    }

    // Extract readable text lines from a page
    async function extractText(page) {
      const content = await page.getTextContent();
      let t = '';
      for (const item of content.items) {
        t += item.str;
        if (item.hasEOL) t += '\n';
        else if (item.str && !item.str.endsWith(' ')) t += ' ';
      }
      return t.trim();
    }

    // ── UI elements ───────────────────────────────────────────────────────────
    const status   = App.el('p', { style: { margin: '10px 0 0', fontSize: '13px', color: 'var(--ink-mute)' } });
    const barTrack = App.el('div', { style: { marginTop: '10px', height: '5px', background: '#e8e8e8',
                                               borderRadius: '3px', overflow: 'hidden' } });
    const bar      = App.el('div', { style: { height: '5px',
                                               background: 'linear-gradient(90deg,#a8d5a2,#5a9c54)',
                                               width: '0', transition: 'width 350ms ease' } });
    barTrack.appendChild(bar);

    // Preview panel (hidden by default — optional, not built until requested)
    const previewWrap = App.el('div', {
      style: { display: 'none', marginTop: '16px', border: '1px solid var(--line)',
               borderRadius: 'var(--r-md)', background: '#fafafa',
               maxHeight: '560px', overflowY: 'auto' }
    });

    // Action row appears after completion
    const actionRow = App.el('div', {
      style: { display: 'none', marginTop: '14px', gap: '10px',
               flexWrap: 'wrap', alignItems: 'center' }
    });

    // Info banner — visible until model is loaded
    const infoBanner = App.el('div', {
      style: { background: '#f0edfb', border: '1px solid #c8bfee',
               borderRadius: 'var(--r-sm)', padding: '11px 16px', marginBottom: '14px', lineHeight: '1.6' }
    }, [
      App.el('strong', { style: { fontSize: '13px' } }, '🤖 מודל AI מקומי — Meta NLLB-200 (תומך 200 שפות)'),
      App.el('br', {}),
      App.el('span', { style: { fontSize: '12px', color: 'var(--ink-mute)' } },
        'בשימוש ראשון מורד מודל ONNX מכווץ (~150MB) ונשמר לצמיתות בדפדפן · פועל גם ללא אינטרנט · ללא מפתח · ללא עלות לעולם')
    ]);

    // ── memory tracker — holds data between Phase 1 and Phase 2 ──────────────
    let _session = null; // { results, blobUrl, dlName }

    function freeSession() {
      if (!_session) return;
      // Revoke blob URL → frees memory held by the doc blob
      if (_session.blobUrl) {
        URL.revokeObjectURL(_session.blobUrl);
      }
      // Drop large image data-URLs
      if (_session.results) {
        _session.results.forEach(r => { r.imgUrl = null; r.origText = null; r.transText = null; });
        _session.results = null;
      }
      _session = null;
      // Clear preview DOM (may hold large img src data)
      previewWrap.innerHTML = '';
      previewWrap.style.display = 'none';
    }

    // ── main process ──────────────────────────────────────────────────────────
    async function processFile(file) {
      if (!file) return;
      if (!window.pdfjsLib) { status.textContent = 'ספריית PDF לא נטענה'; return; }
      if (file.size > MAX_FILE) {
        status.textContent = `הקובץ גדול מדי (${(file.size / 1024 / 1024).toFixed(0)} MB) — מקסימום 500 MB`;
        status.style.color = '#c00'; return;
      }

      // Free previous session before starting a new one
      freeSession();
      initPdfJs();
      actionRow.style.display = 'none';
      bar.style.width = '3%';
      status.style.color = 'var(--ink-mute)';
      status.textContent = 'טוען מודל תרגום AI…';

      const results = []; // { num, imgUrl, origText, transText }

      try {
        // ── Load model ───────────────────────────────────────────────────────
        const pipe = await getPipeline(p => {
          if (p.status === 'progress') {
            const pct = Math.round(p.progress || 0);
            const mb  = p.total ? ` (${(p.total / 1024 / 1024).toFixed(0)} MB)` : '';
            status.textContent = `מוריד מודל AI${mb}… ${pct}% — חד-פעמי`;
            bar.style.width = (3 + pct * 0.12) + '%'; // 3 → 15%
          }
        });
        infoBanner.style.display = 'none'; // hide after first successful load

        // ── Phase 1: Render pages to images + extract text ───────────────────
        status.textContent = 'פותח קובץ PDF…';
        bar.style.width = '16%';
        const ab  = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
        const n   = pdf.numPages;

        for (let i = 1; i <= n; i++) {
          bar.style.width = (16 + (i / n) * 34) + '%'; // 16 → 50%
          status.textContent = `מעבד עמוד ${i} / ${n} — תמונה + טקסט…`;
          const page = await pdf.getPage(i);
          // Render image and extract text in parallel
          const [imgUrl, origText] = await Promise.all([renderPageImg(page), extractText(page)]);
          results.push({ num: i, imgUrl, origText, transText: '' });
        }

        // ── Phase 2: Translate with local model ──────────────────────────────
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          bar.style.width = (50 + (i / results.length) * 46) + '%'; // 50 → 96%
          status.textContent = `מתרגם עמוד ${r.num} / ${n} — Meta NLLB-200 AI…`;
          if (r.origText.length > 8) {
            r.transText = await translatePageText(pipe, r.origText);
          }
        }

        bar.style.width = '100%';
        const tc = results.filter(r => r.transText.trim()).length;
        status.textContent = `✓ תורגמו ${tc} / ${n} עמודים · תמונות ועיצוב נשמרו מהמקור`;
        status.style.color = 'var(--sage-deep)';

        // ── Build Word document (page image + Hebrew translation per page) ────
        const baseName = file.name.replace(/\.pdf$/i, '');
        const docPages = results.map(r => `
          <div style="page-break-after:always;margin-bottom:40px;">
            <p style="font-size:10px;color:#bbb;margin:0 0 8px;direction:ltr;">Page ${r.num} / ${n}</p>
            <!-- full visual render: images, charts, diagrams preserved -->
            <img src="${r.imgUrl}" style="display:block;width:100%;max-width:700px;border:1px solid #e0e0e0;">
            ${r.transText.trim() ? `
            <div dir="rtl" style="margin-top:14px;padding:14px 18px;background:#f2faf2;
                                   border-right:3px solid #5a9c54;border-radius:4px;">
              <p style="font-size:10px;color:#7aac7a;margin:0 0 8px;font-weight:bold;direction:ltr;">
                ● תרגום לעברית (Meta NLLB-200 AI)
              </p>
              <p style="white-space:pre-wrap;font-size:13px;line-height:1.9;margin:0;
                         font-family:Arial,sans-serif;unicode-bidi:plaintext;">${esc(r.transText)}</p>
            </div>` : ''}
          </div>`).join('');

        const docHtml = [
          `<html xmlns:o='urn:schemas-microsoft-com:office:office'`,
          ` xmlns:w='urn:schemas-microsoft-com:office:word'`,
          ` xmlns='http://www.w3.org/TR/REC-html40'>`,
          `<head><meta charset='utf-8'><title>${esc(baseName)}</title>`,
          `<style>body{font-family:Arial,sans-serif;padding:28px;max-width:800px;}`,
          `img{max-width:100%;display:block;}p,h1,h2,h3{unicode-bidi:plaintext;}</style>`,
          `</head><body>`,
          `<h1 style="font-size:19px;margin-bottom:4px;">${esc(baseName)}</h1>`,
          `<p style="font-size:11px;color:#999;margin:0 0 22px;direction:ltr;">`,
          `Translated EN→HE · Meta NLLB-200 local AI · ${new Date().toLocaleDateString('he-IL')}</p>`,
          docPages, `</body></html>`
        ].join('');

        const blob    = new Blob(['﻿', docHtml], { type: 'application/msword' });
        const blobUrl = URL.createObjectURL(blob);
        const dlName  = baseName + '_עברית.doc';

        // Keep session for potential preview + memory release after download
        _session = { results, blobUrl, dlName };

        // ── Build lazy preview (DOM only, no extra copies of image data) ──────
        results.forEach(r => {
          const block = document.createElement('div');
          block.style.cssText = 'border-bottom:1px solid #e8e8e8;padding:18px;';
          block.innerHTML = `
            <div style="font-size:11px;color:#bbb;text-align:center;margin-bottom:10px;">
              — עמוד ${r.num} / ${n} —
            </div>
            <img src="${r.imgUrl}" loading="lazy"
                 style="display:block;width:100%;border:1px solid #ddd;border-radius:6px;margin-bottom:12px;">
            ${r.transText.trim() ? `
            <div style="direction:rtl;background:#f0f9f0;border-radius:8px;
                         padding:13px 17px;border-right:3px solid #5a9c54;">
              <div style="font-size:10px;color:#7aac7a;margin-bottom:7px;font-weight:600;">
                תרגום לעברית · Meta NLLB-200 AI
              </div>
              <div style="white-space:pre-wrap;font-size:13.5px;line-height:1.9;
                           font-family:Arial,sans-serif;">${esc(r.transText)}</div>
            </div>` : `
            <div style="color:#ccc;font-size:12px;text-align:center;padding:4px;">
              (עמוד ויזואלי בלבד)
            </div>`}`;
          previewWrap.appendChild(block);
        });

        // ── Action row: Download + optional Preview ───────────────────────────
        actionRow.innerHTML = '';

        const dlBtn = App.el('button', {
          style: { padding: '11px 24px', background: 'var(--sage)',
                   border: '1px solid var(--sage-deep)', borderRadius: 'var(--r-sm)',
                   fontWeight: 700, cursor: 'pointer', fontSize: '14px' },
          onClick: () => {
            // Trigger download
            const a = document.createElement('a');
            a.href = blobUrl; a.download = dlName; a.click();
            // ── Free memory 3 seconds after download starts ──────────────────
            setTimeout(() => {
              freeSession();
              actionRow.style.display = 'none';
              status.textContent = '✓ הקובץ הורד · זיכרון פונה לתרגום הבא';
              status.style.color = 'var(--ink-mute)';
              bar.style.width = '0';
            }, 3000);
          }
        }, `⬇ הורד תרגום · ${dlName}`);

        let previewOpen = false;
        const toggleBtn = App.el('button', {
          style: { padding: '11px 18px', background: '#fff', border: '1px solid var(--line)',
                   borderRadius: 'var(--r-sm)', cursor: 'pointer', fontSize: '13px' },
          onClick: () => {
            previewOpen = !previewOpen;
            previewWrap.style.display = previewOpen ? 'block' : 'none';
            toggleBtn.textContent = previewOpen ? '🙈 הסתר' : '👁 תצוגה מקדימה';
          }
        }, '👁 תצוגה מקדימה');

        actionRow.append(dlBtn, toggleBtn);
        actionRow.style.display = 'flex';

      } catch (e) {
        status.textContent = 'שגיאה: ' + e.message;
        status.style.color = '#c00';
        bar.style.width = '0';
        console.error(e);
        freeSession();
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
      App.el('div', { style: { fontSize: '44px', marginBottom: '8px' } }, '🌐'),
      App.el('div', { style: { fontWeight: 600, marginBottom: '4px' } }, 'גרור קובץ PDF לכאן'),
      App.el('div', { style: { fontSize: '13px', color: 'var(--ink-mute)' } },
        'אנגלית → עברית · עד 500 MB · תמונות + עיצוב נשמרים · ללא עלות')
    ]);
    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.style.borderColor = 'var(--sage-deep)'; zone.style.background = 'var(--sage)'; });
    zone.addEventListener('dragleave', ()  => { zone.style.borderColor = 'var(--line)'; zone.style.background = 'var(--cream)'; });
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.style.borderColor = 'var(--line)'; zone.style.background = 'var(--cream)';
      processFile(e.dataTransfer.files[0]);
    });

    return App.el('div', { class: 'card' }, [
      App.el('div', { class: 'row row-between', style: { marginBottom: '16px' } }, [
        App.el('h2', {}, 'תרגום קבצי PDF מאנגלית לעברית'),
        App.el('span', { class: 'chip sage' }, 'AI מקומי · ללא עלות לתמיד')
      ]),
      infoBanner,
      fileInput, zone, status, barTrack, actionRow, previewWrap
    ]);
  }

  // ── Main render ──────────────────────────────────────────────────────────
  function render(root) {
    root.append(App.el('div', { class: 'stack stack-lg' }, [
      buildWordToPdf(),
      buildPdfToWord(),
      buildPdfTranslator()
    ]));
  }

  App.register('stickers', render);
})();
