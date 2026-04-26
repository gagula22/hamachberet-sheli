(function () {

  // ── PDF.js worker (local bundle) ─────────────────────────────────────────
  function initPdfJs() {
    if (!window.pdfjsLib) return;
    // Point worker to local bundle so no CDN is needed
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
          // .doc from our app = HTML string
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
    const status   = App.el('p', { style: { margin: '10px 0 0', fontSize: '13px', color: 'var(--ink-mute)' } });
    const bar      = App.el('div', {
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
          html,
          `</body></html>`
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

  // ── Tool 3: PDF → עברית (DeepL — תרגום מקצועי כולל תמונות ותרשימים) ──────
  function buildPdfTranslator() {
    const MAX_FILE   = 500 * 1024 * 1024;
    const PAGE_SCALE = 1.5;
    const JPEG_Q     = 0.82;
    const BATCH_BYTES = 45000; // max chars per DeepL request

    // ── helpers ──────────────────────────────────────────────────────────────
    function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    function getKey()     { return (Store.get('settings') || {}).deeplKey || ''; }
    function saveKey(k)   { const s = Store.get('settings') || {}; s.deeplKey = k.trim(); Store.set('settings', s); }

    function deeplEndpoint(key) {
      return key.endsWith(':fx')
        ? 'https://api-free.deepl.com/v2/translate'
        : 'https://api.deepl.com/v2/translate';
    }

    // Translate an array of strings in batched requests
    async function deeplTranslateMany(texts, apiKey, onProgress) {
      const results = new Array(texts.length).fill('');
      // Group into batches by byte size
      const batches = [];
      let batch = [], batchSize = 0, batchStart = 0;
      for (let i = 0; i < texts.length; i++) {
        const bytes = texts[i].length;
        if (batchSize + bytes > BATCH_BYTES && batch.length) {
          batches.push({ texts: batch, startIdx: batchStart });
          batch = []; batchSize = 0; batchStart = i;
        }
        batch.push(texts[i]); batchSize += bytes;
      }
      if (batch.length) batches.push({ texts: batch, startIdx: batchStart });

      let done = 0;
      for (const b of batches) {
        const res = await fetch(deeplEndpoint(apiKey), {
          method: 'POST',
          headers: { 'Authorization': `DeepL-Auth-Key ${apiKey}`,
                     'Content-Type': 'application/json' },
          body: JSON.stringify({ text: b.texts, source_lang: 'EN', target_lang: 'HE' })
        });
        if (!res.ok) {
          const msg = await res.text().catch(() => res.status);
          throw new Error(`DeepL ${res.status}: ${msg}`);
        }
        const data = await res.json();
        data.translations.forEach((t, j) => { results[b.startIdx + j] = t.text; });
        done += b.texts.length;
        if (onProgress) onProgress(done / texts.length);
      }
      return results;
    }

    // ── render PDF page → JPEG data-URL ──────────────────────────────────────
    async function renderPageImg(page) {
      const vp = page.getViewport({ scale: PAGE_SCALE });
      const c  = document.createElement('canvas');
      c.width  = Math.round(vp.width);
      c.height = Math.round(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const url = c.toDataURL('image/jpeg', JPEG_Q);
      c.width = 1; c.height = 1; // free memory
      return url;
    }

    // ── extract text from page ────────────────────────────────────────────────
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
    const bar      = App.el('div', { style: { height: '5px', background: 'linear-gradient(90deg,var(--sage),var(--sage-deep))',
                                               width: '0', transition: 'width 350ms ease' } });
    barTrack.appendChild(bar);

    // Preview (hidden by default)
    const previewWrap = App.el('div', { style: { display: 'none', marginTop: '16px',
                                                  border: '1px solid var(--line)', borderRadius: 'var(--r-md)',
                                                  background: '#fafafa', maxHeight: '560px', overflowY: 'auto' } });

    // Action row (download + toggle preview) — shown after completion
    const actionRow = App.el('div', { style: { display: 'none', marginTop: '14px',
                                                gap: '10px', flexWrap: 'wrap',
                                                alignItems: 'center' } });
    actionRow.style.display = 'none';

    // ── DeepL API key section ─────────────────────────────────────────────────
    let keyVisible = false;
    const keyInput = document.createElement('input');
    keyInput.type = 'text'; keyInput.placeholder = 'xxxx-xxxx-xxxx-xxxx:fx';
    keyInput.style.cssText = 'flex:1;padding:8px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:monospace;';
    keyInput.value = getKey();

    const keySave = App.el('button', {
      style: { padding: '8px 16px', background: 'var(--sage)', border: '1px solid var(--sage-deep)',
               borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' },
      onClick: () => {
        const k = keyInput.value.trim();
        if (!k) { App.toast('הכנס מפתח DeepL'); return; }
        saveKey(k);
        App.toast('✓ מפתח נשמר');
        keySection.style.display = 'none';
        keyBadge.style.display = 'flex';
        updateKeyBadge();
      }
    }, 'שמור');

    const keyRow = App.el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' } },
      [keyInput, keySave]);

    const keyLink = App.el('a', {
      href: 'https://www.deepl.com/pro-api',
      style: { fontSize: '12px', color: 'var(--lavender-deep)', display: 'block', marginTop: '6px' }
    }, '← קבל מפתח DeepL חינמי (500K תווים/חודש)');
    keyLink.setAttribute('target', '_blank');
    keyLink.setAttribute('rel', 'noopener');

    const keySection = App.el('div', {
      style: { background: 'var(--lavender)', border: '1px solid var(--lavender-deep)',
               borderRadius: 'var(--r-sm)', padding: '12px 16px', marginBottom: '14px' }
    }, [
      App.el('div', { style: { fontSize: '13px', fontWeight: 600, marginBottom: '2px' } }, '🔑 מפתח DeepL API'),
      App.el('div', { style: { fontSize: '12px', color: 'var(--ink-mute)', marginBottom: '4px' } },
        'DeepL מספק תרגום מקצועי ברמת מתרגם אנושי'),
      keyRow, keyLink
    ]);

    // Badge shown when key is already saved
    const keyBadge = App.el('div', {
      style: { display: 'none', alignItems: 'center', gap: '8px', background: 'var(--sage)',
               border: '1px solid var(--sage-deep)', borderRadius: 'var(--r-sm)',
               padding: '8px 14px', marginBottom: '14px', fontSize: '13px' }
    });
    const keyBadgeText = App.el('span', { style: { flex: '1' } }, '');
    const keyBadgeChange = App.el('button', {
      style: { padding: '4px 10px', background: '#fff', border: '1px solid var(--sage-deep)',
               borderRadius: '6px', fontSize: '12px', cursor: 'pointer' },
      onClick: () => {
        keyInput.value = getKey();
        keySection.style.display = 'block';
        keyBadge.style.display = 'none';
      }
    }, 'שנה');
    keyBadge.append(App.el('span', {}, '✓ DeepL מחובר '), keyBadgeText, keyBadgeChange);

    function updateKeyBadge() {
      const k = getKey();
      if (k) {
        const masked = k.slice(0, 4) + '••••••••' + k.slice(-4);
        keyBadgeText.textContent = masked;
        keyBadge.style.display = 'flex';
        keySection.style.display = 'none';
      } else {
        keyBadge.style.display = 'none';
        keySection.style.display = 'block';
      }
    }
    updateKeyBadge();

    // ── main process ──────────────────────────────────────────────────────────
    async function processFile(file) {
      if (!file) return;
      const apiKey = getKey();
      if (!apiKey) {
        App.toast('יש להזין מפתח DeepL תחילה');
        keySection.style.display = 'block'; keyBadge.style.display = 'none';
        return;
      }
      if (!window.pdfjsLib) { status.textContent = 'ספריית PDF לא נטענה'; return; }
      if (file.size > MAX_FILE) {
        status.textContent = `הקובץ גדול מדי (${(file.size/1024/1024).toFixed(0)} MB) — מקסימום 500 MB`;
        status.style.color = '#c00'; return;
      }

      initPdfJs();
      // Reset UI
      actionRow.style.display = 'none';
      previewWrap.style.display = 'none';
      previewWrap.innerHTML = '';
      bar.style.width = '4%';
      status.style.color = 'var(--ink-mute)';
      status.textContent = 'פותח קובץ PDF…';

      const results = []; // { num, imgUrl, origText, transText }

      try {
        const ab  = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
        const n   = pdf.numPages;

        // ── Phase 1: Render + extract (45% of bar) ──
        for (let i = 1; i <= n; i++) {
          bar.style.width = (4 + (i / n) * 41) + '%';
          status.textContent = `מעבד עמוד ${i} / ${n}…`;
          const page = await pdf.getPage(i);
          const [imgUrl, origText] = await Promise.all([renderPageImg(page), extractText(page)]);
          results.push({ num: i, imgUrl, origText, transText: '' });
        }

        // ── Phase 2: Translate via DeepL (remaining 50%) ──
        const textsToTranslate = results.map(r => r.origText);
        const hasAnyText = textsToTranslate.some(t => t.length > 10);

        if (hasAnyText) {
          status.textContent = `שולח ל-DeepL לתרגום (${n} עמודים)…`;
          bar.style.width = '50%';
          const translated = await deeplTranslateMany(
            textsToTranslate,
            apiKey,
            p => { bar.style.width = (50 + p * 44) + '%'; }
          );
          translated.forEach((t, i) => { results[i].transText = t; });
        }

        bar.style.width = '100%';
        const translatedCount = results.filter(r => r.transText.trim()).length;
        status.textContent = `✓ עובדו ${n} עמודים${hasAnyText ? ` · תורגמו ${translatedCount} עמודים ע"י DeepL` : ' (ללא טקסט)'}`;
        status.style.color = 'var(--sage-deep)';

        // ── Build preview HTML (lazy — only when user requests it) ──
        results.forEach(r => {
          const block = document.createElement('div');
          block.style.cssText = 'border-bottom:1px solid #e8e8e8;padding:20px;';
          block.innerHTML = `
            <div style="font-size:11px;color:#bbb;text-align:center;margin-bottom:10px;letter-spacing:.5px;">
              — עמוד ${r.num} / ${n} —
            </div>
            <img src="${r.imgUrl}" loading="lazy"
                 style="display:block;width:100%;border:1px solid #ddd;border-radius:6px;margin-bottom:14px;">
            ${r.transText.trim() ? `
            <div style="direction:rtl;background:linear-gradient(135deg,#f0f7f0,#e8f5e8);
                         border-radius:8px;padding:14px 18px;border-right:3px solid var(--sage-deep);">
              <div style="font-size:10px;color:#8aac8a;margin-bottom:8px;font-weight:600;">תרגום DeepL — עברית</div>
              <div style="white-space:pre-wrap;font-size:13.5px;line-height:1.9;font-family:Arial,sans-serif;">
                ${esc(r.transText)}
              </div>
            </div>` : `
            <div style="color:#ccc;font-size:12px;text-align:center;padding:4px;">
              (עמוד ויזואלי בלבד — ללא טקסט לתרגום)
            </div>`}`;
          previewWrap.appendChild(block);
        });

        // ── Build Word doc ──
        const baseName = file.name.replace(/\.pdf$/i, '');
        const docPages = results.map(r => `
          <div style="page-break-after:always;margin-bottom:40px;">
            <p style="font-size:10px;color:#bbb;margin:0 0 8px;direction:ltr;">Page ${r.num} / ${n}</p>
            <img src="${r.imgUrl}" style="width:100%;max-width:680px;border:1px solid #ddd;">
            ${r.transText.trim() ? `
            <div dir="rtl" style="margin-top:14px;padding:14px 18px;background:#f2faf2;
                                   border-right:3px solid #6aaa6a;border-radius:4px;">
              <p style="font-size:10px;color:#8aac8a;margin:0 0 6px;font-weight:bold;">תרגום (DeepL):</p>
              <p style="white-space:pre-wrap;font-size:13px;line-height:1.9;margin:0;unicode-bidi:plaintext;">
                ${esc(r.transText)}
              </p>
            </div>` : ''}
          </div>`).join('');

        const docHtml = [
          `<html xmlns:o='urn:schemas-microsoft-com:office:office'`,
          ` xmlns:w='urn:schemas-microsoft-com:office:word'`,
          ` xmlns='http://www.w3.org/TR/REC-html40'>`,
          `<head><meta charset='utf-8'><title>${esc(baseName)} — תרגום לעברית</title>`,
          `<style>body{font-family:Arial,sans-serif;padding:30px;max-width:800px;margin:0 auto;}`,
          `img{max-width:100%;}p,h1,h2,h3{unicode-bidi:plaintext;}</style>`,
          `</head><body>`,
          `<h1 style="font-size:20px;margin-bottom:4px;">${esc(baseName)}</h1>`,
          `<p style="font-size:11px;color:#999;margin:0 0 24px;direction:ltr;">`,
          `Translated EN→HE by DeepL &nbsp;·&nbsp; ${new Date().toLocaleDateString('he-IL')}</p>`,
          docPages, `</body></html>`
        ].join('');

        const blob    = new Blob(['﻿', docHtml], { type: 'application/msword' });
        const blobUrl = URL.createObjectURL(blob);
        const dlName  = baseName + '_עברית.doc';

        // Clear & rebuild action row
        actionRow.innerHTML = '';
        const dlBtn = App.el('button', {
          style: { padding: '11px 24px', background: 'var(--sage)', border: '1px solid var(--sage-deep)',
                   borderRadius: 'var(--r-sm)', fontWeight: 700, cursor: 'pointer', fontSize: '14px' },
          onClick: () => { const a = document.createElement('a'); a.href = blobUrl; a.download = dlName; a.click(); }
        }, `⬇ הורד תרגום · ${dlName}`);

        let previewOpen = false;
        const toggleBtn = App.el('button', {
          style: { padding: '11px 18px', background: '#fff', border: '1px solid var(--line)',
                   borderRadius: 'var(--r-sm)', cursor: 'pointer', fontSize: '13px' },
          onClick: () => {
            previewOpen = !previewOpen;
            previewWrap.style.display = previewOpen ? 'block' : 'none';
            toggleBtn.textContent = previewOpen ? '🙈 הסתר תצוגה מקדימה' : '👁 תצוגה מקדימה';
          }
        }, '👁 תצוגה מקדימה');

        actionRow.append(dlBtn, toggleBtn);
        actionRow.style.display = 'flex';

      } catch (e) {
        status.textContent = 'שגיאה: ' + e.message;
        status.style.color = '#c00';
        bar.style.width = '0';
        console.error(e);
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
        'אנגלית → עברית · עד 500 MB · תמונות ותרשימים נשמרים')
    ]);
    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.style.borderColor = 'var(--sage-deep)'; zone.style.background = 'var(--sage)'; });
    zone.addEventListener('dragleave', ()  => { zone.style.borderColor = 'var(--line)'; zone.style.background = 'var(--cream)'; });
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.style.borderColor = 'var(--line)'; zone.style.background = 'var(--cream)';
      processFile(e.dataTransfer.files[0]);
    });

    return App.el('div', { class: 'card' }, [
      App.el('div', { class: 'row row-between', style: { marginBottom: '16px' } }, [
        App.el('h2', {}, '🌐  PDF  →  עברית'),
        App.el('span', { class: 'chip sage' }, 'תרגום מקצועי · DeepL')
      ]),
      keyBadge, keySection,
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
