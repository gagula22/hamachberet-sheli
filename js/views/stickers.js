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
          `<h1 style="font-size:24px;margin-bottom:20px;">${file.name.replace(/\.pdf$/i, '')}</h1>`,
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

  // ══════════════════════════════════════════════════════════════════════════
  //  BACKGROUND TRANSLATION ENGINE
  //  MyMemory API — תרגום שרת-צד, אפס עומס על הדפדפן
  //  הדפדפן שולח fetch, השרת מתרגם, הדפדפן ממשיך לרוץ בחופשיות
  //  ניווט בין עמודים לא מבטל את התרגום — האסינכרוני ממשיך ברקע
  // ══════════════════════════════════════════════════════════════════════════

  // ── Translation helpers ──────────────────────────────────────────────────
  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // Split text into chunks ≤ MAX chars, breaking at sentence/word boundaries
  function _splitChunks(text, MAX) {
    MAX = MAX || 420;
    if (!text || !text.trim()) return [];
    if (text.length <= MAX) return [text.trim()];
    const parts = [];
    let pos = 0;
    while (pos < text.length) {
      let end = pos + MAX;
      if (end >= text.length) { parts.push(text.slice(pos).trim()); break; }
      let cut = -1;
      for (let i = end; i > end - 120 && i > pos; i--) {
        if ('.!?\n'.indexOf(text[i]) >= 0) { cut = i + 1; break; }
      }
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

  // Yield to browser event loop — keeps UI responsive between heavy ops
  function _yield() {
    return new Promise(function(r) { setTimeout(r, 0); });
  }

  // Translate one chunk via MyMemory API (server-side, zero CPU/RAM in browser)
  async function _apiTranslateChunk(text, retries) {
    retries = retries || 0;
    const url = 'https://api.mymemory.translated.net/get?q='
      + encodeURIComponent(text)
      + '&langpair=en%7Che';
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      // responseStatus 200 = success, 429 = rate limit
      if (data.responseStatus === 200) {
        const t = (data.responseData && data.responseData.translatedText) || '';
        // MyMemory echoes back QUERY LIMIT errors as translated text
        if (t.startsWith('QUERY LIMIT') || t.startsWith('MYMEMORY')) return text;
        return t;
      }
      if (data.responseStatus === 429 && retries < 2) {
        await new Promise(function(r) { setTimeout(r, 2000); });
        return _apiTranslateChunk(text, retries + 1);
      }
      return text; // fall back to original on persistent error
    } catch (e) {
      if (retries < 1) {
        await new Promise(function(r) { setTimeout(r, 1500); });
        return _apiTranslateChunk(text, retries + 1);
      }
      return text;
    }
  }

  // Translate a full page's text — splits into chunks, calls API sequentially
  async function _translatePageText(text, cancelCheck) {
    if (!text || !text.trim()) return '';
    const chunks = _splitChunks(text, 420);
    if (!chunks.length) return '';
    const results = [];
    for (let i = 0; i < chunks.length; i++) {
      if (cancelCheck && cancelCheck()) throw new Error('CANCELLED');
      const translated = await _apiTranslateChunk(chunks[i]);
      results.push(translated);
      // 180ms pause between chunk requests — keeps rate limits comfortable
      if (i < chunks.length - 1) {
        await new Promise(function(r) { setTimeout(r, 180); });
      }
    }
    return results.join(' ');
  }

  // ── Global translation session ────────────────────────────────────────────
  var _tsRunning   = false;
  var _tsCancelled = false;
  var _tsSession   = null;  // { blobUrl, dlName, printHtml, baseName, count, total }

  // ── Floating background toast (body-level, survives navigation) ──────────
  var _toast = null;

  function _getToast() {
    if (_toast && document.body.contains(_toast)) return _toast;
    _toast = document.createElement('div');
    _toast.style.cssText = [
      'position:fixed;bottom:24px;left:24px;z-index:99998;',
      'min-width:300px;max-width:360px;',
      'background:#fff;border-radius:18px;',
      'box-shadow:0 8px 36px rgba(0,0,0,.20);',
      'border:1px solid #e4e4e4;overflow:hidden;',
      'direction:rtl;font-family:inherit;display:none;'
    ].join('');
    document.body.appendChild(_toast);
    return _toast;
  }

  function _toastHtml(html) {
    _getToast().innerHTML = html;
    _toast.style.display = 'block';
  }

  function _showToastProgress(pct, text) {
    _toastHtml(`
      <div style="background:linear-gradient(135deg,#5a9c54,#3d7a38);padding:11px 16px;color:#fff;display:flex;align-items:center;gap:10px;">
        <span style="font-size:18px;">🌐</span>
        <strong style="font-size:13px;">תרגום PDF — רץ ברקע</strong>
      </div>
      <div style="padding:13px 16px;">
        <div style="font-size:12px;color:#555;margin-bottom:9px;line-height:1.5;">${text}</div>
        <div style="background:#e8e8e8;border-radius:3px;height:5px;overflow:hidden;margin-bottom:10px;">
          <div style="background:linear-gradient(90deg,#a8d5a2,#5a9c54);height:5px;width:${pct}%;transition:width 400ms ease;"></div>
        </div>
        <button id="bg-cancel-btn"
          style="padding:6px 16px;background:#fff8f8;border:1px solid #ffb3b3;border-radius:8px;font-size:12px;color:#c00;cursor:pointer;">
          ✕ בטל תרגום
        </button>
      </div>`);
    _toast.querySelector('#bg-cancel-btn').onclick = function() {
      _tsCancelled = true;
    };
  }

  function _showToastDone() {
    if (!_tsSession) return;
    _toastHtml(`
      <div style="background:linear-gradient(135deg,#5a9c54,#3d7a38);padding:11px 16px;color:#fff;display:flex;align-items:center;gap:10px;">
        <span style="font-size:20px;">✅</span>
        <div>
          <strong style="font-size:13px;display:block;">התרגום הושלם!</strong>
          <span style="font-size:11px;opacity:.85;">${_tsSession.count} / ${_tsSession.total} עמודים תורגמו</span>
        </div>
      </div>
      <div style="padding:14px 16px;">
        <div style="font-size:12px;color:#666;margin-bottom:12px;">${_esc(_tsSession.dlName)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
          <button id="bg-dl-word" style="flex:1;padding:9px 10px;background:linear-gradient(135deg,#a8d5a2,#5a9c54);border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;color:#fff;">⬇ שמור כ-Word</button>
          <button id="bg-dl-pdf"  style="flex:1;padding:9px 10px;background:linear-gradient(135deg,#cfe4f7,#5ba3d0);border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;color:#fff;">📄 שמור כ-PDF</button>
        </div>
        <button id="bg-close-btn" style="width:100%;padding:7px;background:#f5f5f5;border:1px solid #e0e0e0;border-radius:8px;font-size:12px;cursor:pointer;color:#888;">סגור</button>
      </div>`);

    _toast.querySelector('#bg-dl-word').onclick = function() {
      if (!_tsSession) return;
      const a = document.createElement('a');
      a.href = _tsSession.blobUrl; a.download = _tsSession.dlName; a.click();
      setTimeout(function() {
        if (_tsSession) { URL.revokeObjectURL(_tsSession.blobUrl); _tsSession = null; }
        _toast.style.display = 'none';
      }, 3000);
    };

    _toast.querySelector('#bg-dl-pdf').onclick = function() {
      if (!_tsSession) return;
      const win = window.open('', '_blank');
      if (!win) { alert('אנא אפשר פתיחת חלונות חדשים בדפדפן'); return; }
      win.document.write(_tsSession.printHtml);
      win.document.close();
      // auto-print after images load
      win.onload = function() { setTimeout(function() { win.print(); }, 700); };
    };

    _toast.querySelector('#bg-close-btn').onclick = function() {
      _toast.style.display = 'none';
    };
  }

  function _showToastError(msg) {
    _toastHtml(`
      <div style="background:#c33;padding:11px 16px;color:#fff;display:flex;align-items:center;gap:10px;">
        <span style="font-size:18px;">❌</span>
        <strong style="font-size:13px;">שגיאה בתרגום</strong>
      </div>
      <div style="padding:12px 16px;font-size:12px;color:#555;line-height:1.6;">${_esc(msg)}
        <br><button id="bg-close-err" style="margin-top:8px;padding:5px 14px;background:#f5f5f5;border:1px solid #ddd;border-radius:8px;cursor:pointer;">סגור</button>
      </div>`);
    _toast.querySelector('#bg-close-err').onclick = function() { _toast.style.display = 'none'; };
  }

  function _showToastCancelled() {
    _toastHtml(`
      <div style="padding:16px;font-size:13px;color:#888;text-align:center;line-height:1.7;">
        התרגום בוטל<br>
        <button id="bg-close-can" style="margin-top:8px;padding:5px 14px;background:#f5f5f5;border:1px solid #ddd;border-radius:8px;cursor:pointer;font-size:12px;">סגור</button>
      </div>`);
    _toast.querySelector('#bg-close-can').onclick = function() { _toast.style.display = 'none'; };
  }

  // ── Core background translation ───────────────────────────────────────────
  // PAGE_SCALE 1.0 (was 1.5) — smaller canvas = less RAM, no freeze
  // JPEG_Q     0.65 (was 0.80) — lighter output, still readable
  async function _runTranslation(file, onStatus) {
    const PAGE_SCALE = 1.0;
    const JPEG_Q     = 0.65;

    async function renderPageImg(page) {
      const vp = page.getViewport({ scale: PAGE_SCALE });
      const cv = document.createElement('canvas');
      cv.width  = Math.round(vp.width);
      cv.height = Math.round(vp.height);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const dataUrl = cv.toDataURL('image/jpeg', JPEG_Q);
      cv.width = 1; cv.height = 1;  // release canvas memory immediately
      return dataUrl;
    }

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

    try {
      onStatus('progress', 5, 'פותח קובץ PDF…');
      const ab  = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
      const n   = pdf.numPages;
      const results = [];

      // ── Phase 1: Render pages + extract text (5 → 45%) ─────────────────
      for (let i = 1; i <= n; i++) {
        if (_tsCancelled) throw new Error('CANCELLED');
        const pct = 5 + Math.round((i / n) * 40);
        onStatus('progress', pct, `מעבד עמוד ${i} / ${n} — שומר תמונה…`);
        const page = await pdf.getPage(i);
        const [imgUrl, origText] = await Promise.all([
          renderPageImg(page),
          extractText(page)
        ]);
        results.push({ num: i, imgUrl, origText, transText: '' });
        await _yield(); // let browser breathe between pages
      }

      // ── Phase 2: Translate via MyMemory API (45 → 95%) ─────────────────
      // Each fetch goes to the server — zero CPU/RAM load on the browser
      for (let i = 0; i < results.length; i++) {
        if (_tsCancelled) throw new Error('CANCELLED');
        const r   = results[i];
        const pct = 45 + Math.round((i / results.length) * 50);
        onStatus('progress', pct, `מתרגם עמוד ${r.num} / ${n}…`);
        if (r.origText.length > 5) {
          r.transText = await _translatePageText(r.origText, () => _tsCancelled);
        }
      }

      onStatus('progress', 97, 'מכין קבצים…');
      const baseName = file.name.replace(/\.pdf$/i, '');
      const tc = results.filter(function(r) { return r.transText.trim(); }).length;

      // ── Build printable HTML for PDF export (via browser print) ─────────
      const printPages = results.map(function(r) {
        return `<div class="page">
          <div class="pnum">עמוד ${r.num} / ${n}</div>
          <img src="${r.imgUrl}">
          ${r.transText.trim()
            ? `<div class="trans">${_esc(r.transText)}</div>`
            : ''}
        </div>`;
      }).join('');

      const printHtml = `<!DOCTYPE html>
<html dir="rtl"><head><meta charset="utf-8">
<title>${_esc(baseName)} — תרגום עברית</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:Arial,sans-serif;background:#fff;color:#222;}
  .cover{padding:20mm 20mm 10mm;max-width:800px;margin:0 auto;}
  .cover h1{font-size:22px;margin-bottom:6px;}
  .cover p{font-size:11px;color:#999;direction:ltr;}
  .cover .hint{margin-top:12px;font-size:13px;color:#3d7a38;background:#f2faf2;
               padding:10px 14px;border-radius:8px;border-right:3px solid #5a9c54;}
  .page{padding:14mm 20mm;max-width:800px;margin:0 auto;page-break-after:always;}
  .pnum{font-size:10px;color:#bbb;margin-bottom:8px;direction:ltr;}
  img{display:block;width:100%;border:1px solid #e4e4e4;margin-bottom:14px;}
  .trans{direction:rtl;background:#f2faf2;border-right:3px solid #5a9c54;
         padding:14px 18px;border-radius:4px;font-size:13px;line-height:1.9;
         white-space:pre-wrap;}
  @media print{
    .cover{display:none;}
    .page{padding:10mm 12mm;page-break-after:always;}
    img{max-width:100%;}
  }
</style>
</head><body>
<div class="cover">
  <h1>${_esc(baseName)}</h1>
  <p>תרגום EN→HE · MyMemory API · ${new Date().toLocaleDateString('he-IL')}</p>
  <div class="hint">📄 לחץ Ctrl+P → יעד: שמור כ-PDF → שמור (בחר איפה לשמור)</div>
</div>
${printPages}
</body></html>`;

      // ── Build Word .doc ─────────────────────────────────────────────────
      const docPages = results.map(function(r) {
        return `<div style="page-break-after:always;margin-bottom:40px;">
          <p style="font-size:10px;color:#bbb;margin:0 0 8px;direction:ltr;">Page ${r.num} / ${n}</p>
          <img src="${r.imgUrl}" style="display:block;width:100%;max-width:700px;border:1px solid #e0e0e0;">
          ${r.transText.trim() ? `
          <div dir="rtl" style="margin-top:14px;padding:14px 18px;background:#f2faf2;border-right:3px solid #5a9c54;border-radius:4px;">
            <p style="font-size:10px;color:#7aac7a;margin:0 0 8px;font-weight:bold;direction:ltr;">● תרגום לעברית</p>
            <p style="white-space:pre-wrap;font-size:13px;line-height:1.9;margin:0;
               font-family:Arial,sans-serif;unicode-bidi:plaintext;">${_esc(r.transText)}</p>
          </div>` : ''}
        </div>`;
      }).join('');

      const docHtml = [
        `<html xmlns:o='urn:schemas-microsoft-com:office:office'`,
        ` xmlns:w='urn:schemas-microsoft-com:office:word'`,
        ` xmlns='http://www.w3.org/TR/REC-html40'>`,
        `<head><meta charset='utf-8'><title>${_esc(baseName)}</title>`,
        `<style>body{font-family:Arial,sans-serif;padding:28px;max-width:800px;}`,
        `img{max-width:100%;display:block;}p,h1{unicode-bidi:plaintext;}</style>`,
        `</head><body>`,
        `<h1 style="font-size:19px;margin-bottom:4px;">${_esc(baseName)}</h1>`,
        `<p style="font-size:11px;color:#999;margin:0 0 22px;direction:ltr;">`,
        `Translated EN→HE · ${new Date().toLocaleDateString('he-IL')}</p>`,
        docPages, `</body></html>`
      ].join('');

      const blob    = new Blob(['﻿', docHtml], { type: 'application/msword' });
      const blobUrl = URL.createObjectURL(blob);
      const dlName  = baseName + '_עברית.doc';

      if (_tsSession) URL.revokeObjectURL(_tsSession.blobUrl);
      _tsSession = { blobUrl, dlName, printHtml, baseName, count: tc, total: n };

      onStatus('ready', 100, '');

    } catch (e) {
      if (e.message === 'CANCELLED') {
        onStatus('cancelled', 0, '');
      } else {
        onStatus('error', 0, e.message);
        console.error('[PDF Translator]', e);
      }
    } finally {
      _tsRunning = false;
    }
  }

  // ── Tool 3: PDF → עברית ──────────────────────────────────────────────────
  function buildPdfTranslator() {
    const MAX_FILE = 500 * 1024 * 1024;

    const statusEl = App.el('p', {
      style: { margin: '10px 0 0', fontSize: '13px', color: 'var(--ink-mute)' }
    });
    const barTrack = App.el('div', {
      style: { marginTop: '10px', height: '5px', background: '#e8e8e8',
               borderRadius: '3px', overflow: 'hidden' }
    });
    const barFill = App.el('div', {
      style: { height: '5px', background: 'linear-gradient(90deg,#a8d5a2,#5a9c54)',
               width: '0', transition: 'width 400ms ease' }
    });
    barTrack.appendChild(barFill);

    const bgBadge = App.el('div', {
      style: { display: 'none', marginTop: '12px', padding: '10px 14px',
               background: '#f0f9f0', border: '1px solid #a8d5a2',
               borderRadius: 'var(--r-sm)', fontSize: '13px', color: '#3d7a38', lineHeight: '1.5' }
    }, '🌐 התרגום רץ ברקע · תוכל לנווט בחופשיות · תקבל הודעה כשיסיים');

    const infoBanner = App.el('div', {
      style: { background: '#f0f9f0', border: '1px solid #a8d5a2',
               borderRadius: 'var(--r-sm)', padding: '11px 16px', marginBottom: '14px', lineHeight: '1.6' }
    }, [
      App.el('strong', { style: { fontSize: '13px' } }, '🌐 תרגום שרת-צד — ללא עומס על הדפדפן'),
      App.el('br', {}),
      App.el('span', { style: { fontSize: '12px', color: 'var(--ink-mute)' } },
        'כל עמוד מרונדר כתמונה (תמונות + עיצוב נשמרים) · הטקסט מתורגם דרך שרת חיצוני · אפס AI מקומי · ללא הקפאה · ללא עלות')
    ]);

    // Restore state if translation already running/done when view mounts
    if (_tsRunning) {
      bgBadge.style.display = 'block';
      statusEl.textContent   = 'תרגום פעיל ברקע…';
      barFill.style.width    = '50%';
      infoBanner.style.display = 'none';
    }
    if (_tsSession && !_tsRunning) {
      _showToastDone();
      infoBanner.style.display = 'none';
    }

    async function processFile(file) {
      if (!file || _tsRunning) return;
      if (!window.pdfjsLib) { statusEl.textContent = 'ספריית PDF לא נטענה'; return; }
      if (file.size > MAX_FILE) {
        statusEl.textContent = `הקובץ גדול מדי — מקסימום 500 MB`;
        statusEl.style.color = '#c00'; return;
      }

      _tsRunning   = true;
      _tsCancelled = false;
      initPdfJs();
      infoBanner.style.display = 'none';
      barFill.style.width       = '3%';
      statusEl.style.color      = 'var(--ink-mute)';
      statusEl.textContent      = 'מתחיל תרגום ברקע…';
      bgBadge.style.display     = 'block';
      _showToastProgress(3, 'פותח קובץ PDF…');

      function onStatus(phase, pct, text) {
        // Toast always updated (persistent)
        if      (phase === 'progress')  _showToastProgress(pct, text);
        else if (phase === 'ready')     _showToastDone();
        else if (phase === 'error')     _showToastError(text);
        else if (phase === 'cancelled') _showToastCancelled();

        // Card UI updated only while still in DOM
        if (!document.body.contains(statusEl)) return;
        if (phase === 'progress') {
          barFill.style.width  = pct + '%';
          statusEl.textContent = text;
        } else if (phase === 'ready') {
          barFill.style.width      = '100%';
          bgBadge.style.display    = 'none';
          statusEl.style.color     = 'var(--sage-deep)';
          statusEl.textContent     = `✓ ${_tsSession.count} / ${_tsSession.total} עמודים תורגמו · ראה הודעה בפינה`;
        } else if (phase === 'error') {
          barFill.style.width   = '0';
          bgBadge.style.display = 'none';
          statusEl.style.color  = '#c00';
          statusEl.textContent  = 'שגיאה: ' + text;
        } else if (phase === 'cancelled') {
          barFill.style.width   = '0';
          bgBadge.style.display = 'none';
          statusEl.style.color  = 'var(--ink-mute)';
          statusEl.textContent  = 'התרגום בוטל';
        }
      }

      // Fire-and-forget — async runs even after navigation
      _runTranslation(file, onStatus);
    }

    const fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.accept = '.pdf'; fileInput.style.display = 'none';
    fileInput.addEventListener('change', function() {
      processFile(fileInput.files[0]); fileInput.value = '';
    });

    const zone = App.el('div', {
      style: { border: '2px dashed var(--line)', borderRadius: 'var(--r-md)',
               padding: '36px 20px', textAlign: 'center', cursor: 'pointer',
               transition: 'all 180ms', background: 'var(--cream)' },
      onClick: function() { if (!_tsRunning) fileInput.click(); }
    }, [
      App.el('div', { style: { fontSize: '44px', marginBottom: '8px' } }, '🌐'),
      App.el('div', { style: { fontWeight: 600, marginBottom: '4px' } }, 'גרור קובץ PDF לכאן'),
      App.el('div', { style: { fontSize: '13px', color: 'var(--ink-mute)' } },
        'אנגלית → עברית · עד 500 MB · תמונות + עיצוב נשמרים · עובד ברקע · ללא עלות')
    ]);
    zone.addEventListener('dragover',  function(e) { e.preventDefault(); zone.style.borderColor = 'var(--sage-deep)'; zone.style.background = 'var(--sage)'; });
    zone.addEventListener('dragleave', function()  { zone.style.borderColor = 'var(--line)'; zone.style.background = 'var(--cream)'; });
    zone.addEventListener('drop', function(e) {
      e.preventDefault(); zone.style.borderColor = 'var(--line)'; zone.style.background = 'var(--cream)';
      if (!_tsRunning) processFile(e.dataTransfer.files[0]);
    });

    return App.el('div', { class: 'card' }, [
      App.el('div', { class: 'row row-between', style: { marginBottom: '16px' } }, [
        App.el('h2', {}, 'תרגום קבצי PDF מאנגלית לעברית'),
        App.el('span', { class: 'chip sage' }, 'שרת-צד · ללא הקפאה · ללא עלות')
      ]),
      infoBanner,
      fileInput, zone, statusEl, barTrack, bgBadge
    ]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  HEBREW VIDEO / AUDIO TRANSCRIBER
  //  Browser mode  : Whisper-small (Transformers.js) → Word doc, no freeze
  //  Full quality  : generates Python command for Claude Code / terminal
  // ══════════════════════════════════════════════════════════════════════════

  const WHISPER_WORKER_SRC = `
let _pipe = null;
self.onmessage = async function(e) {
  var d = e.data;
  if (d.type === 'init') {
    try {
      var mod = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
      var pipeline = mod.pipeline, env = mod.env;
      env.allowLocalModels = false;
      env.useBrowserCache  = false;
      _pipe = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small', {
        quantized: true,
        progress_callback: function(p) {
          self.postMessage({ type: 'progress', status: p.status, progress: p.progress || 0 });
        }
      });
      self.postMessage({ type: 'ready' });
    } catch(err) {
      self.postMessage({ type: 'error', message: err.message });
    }
  } else if (d.type === 'transcribe') {
    try {
      var result = await _pipe(
        { data: d.audio, sampling_rate: 16000 },
        { language: 'hebrew', task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 }
      );
      self.postMessage({ type: 'result', text: result.text });
    } catch(err) {
      self.postMessage({ type: 'error', message: err.message });
    }
  }
};
`;

  var _ww        = null;   // Whisper Worker instance
  var _wwReady   = null;   // null | Promise<void>
  var _wwProgCb  = null;   // progress callback
  var _wwDone    = null;   // { resolve, reject }
  var _vtRunning = false;
  var _vtToast   = null;

  function _ensureWhisperWorker() {
    if (_wwReady) return _wwReady;
    var blob = new Blob([WHISPER_WORKER_SRC], { type: 'text/javascript' });
    _ww = new Worker(URL.createObjectURL(blob));
    _wwReady = new Promise(function(resolve, reject) {
      _ww.onmessage = function(e) {
        var d = e.data;
        if (d.type === 'progress') {
          if (_wwProgCb) _wwProgCb(d);
        } else if (d.type === 'ready') {
          resolve();
        } else if (d.type === 'error') {
          _wwReady = null;
          try { _ww.terminate(); } catch(_) {}
          _ww = null;
          if (_wwDone) { _wwDone.reject(new Error(d.message)); _wwDone = null; }
          else reject(new Error(d.message));
        } else if (d.type === 'result') {
          if (_wwDone) { _wwDone.resolve(d.text); _wwDone = null; }
        }
      };
      _ww.onerror = function(err) {
        _wwReady = null; _ww = null;
        if (_wwDone) { _wwDone.reject(err); _wwDone = null; }
        else reject(err);
      };
      _ww.postMessage({ type: 'init' });
    });
    return _wwReady;
  }

  function _whisperTranscribe(audioFloat32) {
    return new Promise(function(resolve, reject) {
      _wwDone = { resolve: resolve, reject: reject };
      _ww.postMessage({ type: 'transcribe', audio: audioFloat32 }, [audioFloat32.buffer]);
    });
  }

  // Floating toast for transcription (separate from translation toast)
  function _getVtToast() {
    if (_vtToast && document.body.contains(_vtToast)) return _vtToast;
    _vtToast = document.createElement('div');
    _vtToast.style.cssText = [
      'position:fixed;bottom:24px;right:24px;z-index:99997;',
      'min-width:300px;max-width:360px;',
      'background:#fff;border-radius:18px;',
      'box-shadow:0 8px 36px rgba(0,0,0,.20);',
      'border:1px solid #e4e4e4;overflow:hidden;',
      'direction:rtl;font-family:inherit;display:none;'
    ].join('');
    document.body.appendChild(_vtToast);
    return _vtToast;
  }
  function _vtToastHtml(html) { _getVtToast().innerHTML = html; _vtToast.style.display = 'block'; }

  function _vtShowProgress(pct, text) {
    _vtToastHtml(`
      <div style="background:linear-gradient(135deg,#5ba3d0,#2d6f9c);padding:11px 16px;color:#fff;display:flex;align-items:center;gap:10px;">
        <span style="font-size:18px;">🎙</span>
        <strong style="font-size:13px;">תמלול וידאו — רץ ברקע</strong>
      </div>
      <div style="padding:13px 16px;">
        <div style="font-size:12px;color:#555;margin-bottom:9px;line-height:1.5;">${text}</div>
        <div style="background:#e8e8e8;border-radius:3px;height:5px;overflow:hidden;">
          <div style="background:linear-gradient(90deg,#cfe4f7,#5ba3d0);height:5px;width:${pct}%;transition:width 400ms ease;"></div>
        </div>
      </div>`);
  }

  function _vtShowDone(dlName, blobUrl) {
    _vtToastHtml(`
      <div style="background:linear-gradient(135deg,#5ba3d0,#2d6f9c);padding:11px 16px;color:#fff;display:flex;align-items:center;gap:10px;">
        <span style="font-size:20px;">✅</span>
        <strong style="font-size:13px;">התמלול הושלם!</strong>
      </div>
      <div style="padding:14px 16px;">
        <div style="font-size:12px;color:#666;margin-bottom:12px;">${_esc(dlName)}</div>
        <button id="vt-dl-btn" style="width:100%;padding:10px;background:linear-gradient(135deg,#cfe4f7,#5ba3d0);border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;color:#fff;margin-bottom:8px;">⬇ שמור קובץ Word</button>
        <button id="vt-close-btn" style="width:100%;padding:7px;background:#f5f5f5;border:1px solid #e0e0e0;border-radius:8px;font-size:12px;cursor:pointer;color:#888;">סגור</button>
      </div>`);
    _vtToast.querySelector('#vt-dl-btn').onclick = function() {
      var a = document.createElement('a'); a.href = blobUrl; a.download = dlName; a.click();
      setTimeout(function() { URL.revokeObjectURL(blobUrl); _vtToast.style.display = 'none'; }, 3000);
    };
    _vtToast.querySelector('#vt-close-btn').onclick = function() { _vtToast.style.display = 'none'; };
  }

  function _vtShowError(msg) {
    _vtToastHtml(`
      <div style="background:#c33;padding:11px 16px;color:#fff;display:flex;align-items:center;gap:10px;">
        <span style="font-size:18px;">❌</span><strong style="font-size:13px;">שגיאה בתמלול</strong>
      </div>
      <div style="padding:12px 16px;font-size:12px;color:#555;line-height:1.6;">${_esc(msg)}
        <br><button id="vt-close-err" style="margin-top:8px;padding:5px 14px;background:#f5f5f5;border:1px solid #ddd;border-radius:8px;cursor:pointer;">סגור</button>
      </div>`);
    _vtToast.querySelector('#vt-close-err').onclick = function() { _vtToast.style.display = 'none'; };
  }

  // ── Tool 4: תמלול וידאו בעברית ───────────────────────────────────────────
  function buildVideoTranscriber() {
    const MAX_FILE = 2 * 1024 * 1024 * 1024; // 2 GB

    const statusEl = App.el('p', { style: { margin: '10px 0 0', fontSize: '13px', color: 'var(--ink-mute)' } });
    const barTrack = App.el('div', { style: { marginTop: '10px', height: '5px', background: '#e8e8e8', borderRadius: '3px', overflow: 'hidden' } });
    const barFill  = App.el('div', { style: { height: '5px', background: 'linear-gradient(90deg,#cfe4f7,#5ba3d0)', width: '0', transition: 'width 400ms ease' } });
    barTrack.appendChild(barFill);

    const bgBadge = App.el('div', {
      style: { display: 'none', marginTop: '12px', padding: '10px 14px',
               background: '#f0f6fb', border: '1px solid #a0c8e8',
               borderRadius: 'var(--r-sm)', fontSize: '13px', color: '#2d6f9c', lineHeight: '1.5' }
    }, '🎙 התמלול רץ ברקע · תוכל לנווט בחופשיות · תקבל הודעה כשיסיים');

    // ── Audio file processing ─────────────────────────────────────────────
    async function transcribeFile(file) {
      if (!file || _vtRunning) return;
      if (file.size > MAX_FILE) { statusEl.textContent = 'קובץ גדול מדי — מקסימום 2 GB'; statusEl.style.color = '#c00'; return; }

      _vtRunning = true;
      barFill.style.width    = '3%';
      statusEl.style.color   = 'var(--ink-mute)';
      statusEl.textContent   = 'מפענח קובץ אודיו…';
      bgBadge.style.display  = 'block';
      _vtShowProgress(3, 'מפענח קובץ אודיו…');

      // Run everything async — non-blocking even after navigation
      (async function() {
        try {
          // 1. Decode audio to 16kHz mono Float32Array
          statusEl.textContent = 'מפענח קובץ אודיו…';
          const ab       = await file.arrayBuffer();
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
          const decoded  = await audioCtx.decodeAudioData(ab);
          const raw      = decoded.getChannelData(0);
          const audio    = new Float32Array(raw); // copy so we can transfer
          audioCtx.close();
          const durationMin = Math.round(decoded.duration / 60);

          // 2. Init Whisper Worker (downloads model ~150 MB first time)
          _wwProgCb = function(p) {
            if (p.status === 'progress') {
              const pct = Math.round(p.progress || 0);
              const msg = `מוריד מודל Whisper… ${pct}% — חד-פעמי`;
              if (document.body.contains(statusEl)) { barFill.style.width = (3 + pct * 0.15) + '%'; statusEl.textContent = msg; }
              _vtShowProgress(3 + pct * 0.15, msg);
            }
          };
          const initMsg = 'מאתחל מודל Whisper AI…';
          if (document.body.contains(statusEl)) statusEl.textContent = initMsg;
          _vtShowProgress(18, initMsg);
          await _ensureWhisperWorker();

          // 3. Transcribe
          const transMsg = `מתמלל ${durationMin} דקות אודיו ברקע…`;
          if (document.body.contains(statusEl)) { barFill.style.width = '22%'; statusEl.textContent = transMsg; }
          _vtShowProgress(22, transMsg);

          const text = await _whisperTranscribe(audio);

          // 4. Build Word .doc
          if (document.body.contains(statusEl)) _vtShowProgress(97, 'מכין קובץ Word…');
          const baseName  = file.name.replace(/\.[^.]+$/, '');
          const dateStr   = new Date().toLocaleDateString('he-IL');
          const paragraphs = text.trim().split(/\n+/).map(function(p) {
            return p.trim() ? `<p style="direction:rtl;text-align:right;font-family:Arial,sans-serif;font-size:14px;line-height:1.9;margin:0 0 10px;unicode-bidi:plaintext;">${_esc(p.trim())}</p>` : '';
          }).join('');

          const docHtml = [
            `<html xmlns:o='urn:schemas-microsoft-com:office:office'`,
            ` xmlns:w='urn:schemas-microsoft-com:office:word'`,
            ` xmlns='http://www.w3.org/TR/REC-html40'>`,
            `<head><meta charset='utf-8'><title>${_esc(baseName)}</title>`,
            `<style>body{font-family:Arial,sans-serif;padding:36px;max-width:820px;direction:rtl;}`,
            `p{unicode-bidi:plaintext;}</style></head>`,
            `<body dir="rtl">`,
            `<h1 style="font-size:22px;margin-bottom:4px;direction:rtl;text-align:right;">${_esc(baseName)}</h1>`,
            `<p style="font-size:11px;color:#999;margin:0 0 28px;direction:ltr;text-align:left;">`,
            `תמלול עברית · Whisper AI · ${dateStr}</p>`,
            `<hr style="border:none;border-top:1px solid #e0e0e0;margin-bottom:24px;">`,
            paragraphs,
            `</body></html>`
          ].join('');

          const blob    = new Blob(['﻿', docHtml], { type: 'application/msword' });
          const blobUrl = URL.createObjectURL(blob);
          const dlName  = baseName + '_תמלול.doc';

          if (document.body.contains(statusEl)) {
            barFill.style.width    = '100%';
            bgBadge.style.display  = 'none';
            statusEl.style.color   = 'var(--sky-deep,#2d6f9c)';
            statusEl.textContent   = `✓ תמלול הושלם · ${Math.round(text.split(/\s+/).length)} מילים · ראה הודעה בפינה`;
          }
          _vtShowDone(dlName, blobUrl);

        } catch (e) {
          if (document.body.contains(statusEl)) {
            barFill.style.width   = '0';
            bgBadge.style.display = 'none';
            statusEl.style.color  = '#c00';
            statusEl.textContent  = 'שגיאה: ' + e.message;
          }
          _vtShowError(e.message);
          console.error('[Transcriber]', e);
        } finally {
          _vtRunning = false;
        }
      })();
    }

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.mp3,.mp4,.wav,.m4a,.webm,.ogg,.aac,.flac';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', function() { transcribeFile(fileInput.files[0]); fileInput.value = ''; });

    const zone = App.el('div', {
      style: { border: '2px dashed var(--line)', borderRadius: 'var(--r-md)',
               padding: '32px 20px', textAlign: 'center', cursor: 'pointer',
               transition: 'all 180ms', background: 'var(--cream)' },
      onClick: function() { if (!_vtRunning) fileInput.click(); }
    }, [
      App.el('div', { style: { fontSize: '44px', marginBottom: '8px' } }, '🎙'),
      App.el('div', { style: { fontWeight: 600, marginBottom: '4px' } }, 'גרור קובץ אודיו / וידאו לכאן'),
      App.el('div', { style: { fontSize: '13px', color: 'var(--ink-mute)' } },
        '.mp3  .mp4  .wav  .m4a  .webm  .ogg  .aac  .flac · עד 2 GB · תמלול ברקע')
    ]);
    zone.addEventListener('dragover',  function(e) { e.preventDefault(); zone.style.borderColor = 'var(--sky-deep,#5ba3d0)'; zone.style.background = 'var(--sky,#cfe4f7)'; });
    zone.addEventListener('dragleave', function()  { zone.style.borderColor = 'var(--line)'; zone.style.background = 'var(--cream)'; });
    zone.addEventListener('drop', function(e) {
      e.preventDefault(); zone.style.borderColor = 'var(--line)'; zone.style.background = 'var(--cream)';
      if (!_vtRunning) transcribeFile(e.dataTransfer.files[0]);
    });

    // ── YouTube / Full-quality section ────────────────────────────────────
    const ytInput = document.createElement('input');
    ytInput.type        = 'text';
    ytInput.placeholder = 'https://www.youtube.com/watch?v=...';
    ytInput.style.cssText = [
      'width:100%;padding:10px 14px;border:1px solid var(--line);',
      'border-radius:var(--r-sm);font-size:13px;direction:ltr;',
      'background:#fff;outline:none;box-sizing:border-box;',
      'font-family:inherit;color:var(--ink);'
    ].join('');

    const skillPath = 'C:\\Users\\user\\AppData\\Roaming\\Claude\\local-agent-mode-sessions\\skills-plugin\\b0cabb1a-8956-4ec5-bde8-98bd671598de\\c9f03117-575f-4a16-b1b5-63183dc364cd\\skills\\hebrew-video-transcriber\\scripts\\transcribe_video.py';

    const cmdBox = App.el('div', {
      style: { display: 'none', marginTop: '10px', background: '#1e1e1e', color: '#d4d4d4',
               borderRadius: 'var(--r-sm)', padding: '12px 14px', fontSize: '11px',
               fontFamily: 'monospace', direction: 'ltr', wordBreak: 'break-all',
               lineHeight: '1.7', position: 'relative' }
    });

    const copyBtn = App.el('button', {
      style: { marginTop: '8px', padding: '8px 18px', background: 'var(--sky,#cfe4f7)',
               border: '1px solid var(--sky-deep,#5ba3d0)', borderRadius: 'var(--r-sm)',
               fontSize: '13px', cursor: 'pointer', fontWeight: 600, display: 'none' }
    }, '📋 העתק פקודה');

    function buildCommand() {
      const url = (ytInput.value || '').trim();
      if (!url) return '';
      const title = 'video_transcript';
      return `python "${skillPath}" "${url}" --output "C:\\Users\\user\\Documents" --title "${title}"`;
    }

    ytInput.addEventListener('input', function() {
      const cmd = buildCommand();
      if (cmd) {
        cmdBox.textContent = cmd;
        cmdBox.style.display = 'block';
        copyBtn.style.display = 'inline-block';
      } else {
        cmdBox.style.display = 'none';
        copyBtn.style.display = 'none';
      }
    });

    copyBtn.addEventListener('click', function() {
      navigator.clipboard.writeText(buildCommand()).then(function() {
        copyBtn.textContent = '✓ הועתק!';
        setTimeout(function() { copyBtn.textContent = '📋 העתק פקודה'; }, 2000);
      });
    });

    const ytSection = App.el('div', {
      style: { marginTop: '20px', paddingTop: '18px', borderTop: '1px solid var(--line)' }
    }, [
      App.el('div', {
        style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }
      }, [
        App.el('span', { style: { fontSize: '18px' } }, '▶️'),
        App.el('strong', { style: { fontSize: '14px' } }, 'YouTube / איכות מלאה + צילומי מסך'),
      ]),
      App.el('p', { style: { fontSize: '12px', color: 'var(--ink-mute)', margin: '0 0 10px', lineHeight: '1.6' } },
        'להרצה עם מודל large-v3 + צילומי מסך אוטומטיים — הדבק URL, העתק את הפקודה והרץ ב-Terminal או ב-Claude Code'),
      ytInput, cmdBox, copyBtn
    ]);

    const infoBanner = App.el('div', {
      style: { background: '#f0f6fb', border: '1px solid #a0c8e8',
               borderRadius: 'var(--r-sm)', padding: '11px 16px', marginBottom: '14px', lineHeight: '1.6' }
    }, [
      App.el('strong', { style: { fontSize: '13px' } }, '🎙 Whisper AI · Web Worker — הדפדפן לא ייחסם'),
      App.el('br', {}),
      App.el('span', { style: { fontSize: '12px', color: 'var(--ink-mute)' } },
        'קבצים מקומיים: תמלול ישיר בדפדפן (מודל ~150MB, חד-פעמי) · YouTube + צילומי מסך: הרץ דרך Claude Code / Terminal')
    ]);

    return App.el('div', { class: 'card' }, [
      App.el('div', { class: 'row row-between', style: { marginBottom: '16px' } }, [
        App.el('h2', {}, '🎙  תמלול וידאו בעברית'),
        App.el('span', { class: 'chip sky' }, 'Whisper AI · ברקע · ללא עלות')
      ]),
      infoBanner,
      fileInput, zone, statusEl, barTrack, bgBadge,
      ytSection
    ]);
  }

  // ── Main render ───────────────────────────────────────────────────────────
  function render(root) {
    root.append(App.el('div', { class: 'stack stack-lg' }, [
      buildWordToPdf(),
      buildPdfToWord(),
      buildPdfTranslator(),
      buildVideoTranscriber()
    ]));
  }

  App.register('stickers', render);
})();
