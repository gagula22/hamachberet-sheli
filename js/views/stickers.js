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
      var modelName = d.model || 'Xenova/whisper-small';
      var mod = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
      var pipeline = mod.pipeline, env = mod.env;
      env.allowLocalModels = false;
      env.useBrowserCache  = false;
      _pipe = await pipeline('automatic-speech-recognition', modelName, {
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
        { language: 'hebrew', task: 'transcribe',
          chunk_length_s: 30, stride_length_s: 5,
          return_timestamps: true }
      );
      self.postMessage({ type: 'result', text: result.text, chunks: result.chunks || [] });
    } catch(err) {
      self.postMessage({ type: 'error', message: err.message });
    }
  }
};
`;

  var _ww        = null;   // Whisper Worker instance
  var _wwReady   = null;   // null | Promise<void>
  var _wwModel   = null;   // currently-initialised model name
  var _wwProgCb  = null;   // progress callback
  var _wwDone    = null;   // { resolve, reject }
  var _vtRunning = false;
  var _vtToast   = null;

  function _ensureWhisperWorker(model) {
    model = model || 'Xenova/whisper-small';
    if (_wwReady && _wwModel === model) return _wwReady;
    // Different model requested → tear down and re-init
    if (_ww) { try { _ww.terminate(); } catch(_) {} }
    _ww = null; _wwReady = null; _wwDone = null;
    _wwModel = model;

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
          _ww = null; _wwModel = null;
          if (_wwDone) { _wwDone.reject(new Error(d.message)); _wwDone = null; }
          else reject(new Error(d.message));
        } else if (d.type === 'result') {
          if (_wwDone) {
            _wwDone.resolve({ text: d.text, chunks: d.chunks || [] });
            _wwDone = null;
          }
        }
      };
      _ww.onerror = function(err) {
        _wwReady = null; _ww = null; _wwModel = null;
        if (_wwDone) { _wwDone.reject(err); _wwDone = null; }
        else reject(err);
      };
      _ww.postMessage({ type: 'init', model: model });
    });
    return _wwReady;
  }

  function _whisperTranscribe(audioFloat32) {
    return new Promise(function(resolve, reject) {
      _wwDone = { resolve: resolve, reject: reject };
      _ww.postMessage({ type: 'transcribe', audio: audioFloat32 }, [audioFloat32.buffer]);
    });
  }

  // ── Helpers for advanced-settings panel ──────────────────────────────────
  // "600" / "10:00" / "01:23:45" / "10m" / "1h2m3s" / "90s" → seconds
  function _parseTimeInput(str) {
    if (str == null) return null;
    var s = String(str).trim();
    if (!s) return null;
    if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    if (/^(\d+:)?\d+:\d+(\.\d+)?$/.test(s)) {
      var p = s.split(':').map(parseFloat);
      if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
      if (p.length === 2) return p[0] * 60 + p[1];
    }
    var m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
    if (m && (m[1] || m[2] || m[3])) {
      return (parseInt(m[1] || 0, 10)) * 3600 +
             (parseInt(m[2] || 0, 10)) * 60 +
             (parseInt(m[3] || 0, 10));
    }
    return NaN; // signal "couldn't parse" (vs null = empty)
  }

  function _formatHMS(seconds) {
    seconds = Math.max(0, Math.floor(seconds || 0));
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds % 60;
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return p(h) + ':' + p(m) + ':' + p(s);
  }

  function _extractYouTubeId(url) {
    if (!url) return null;
    var m = String(url).match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([^&?/#]+)/);
    return m ? m[1] : null;
  }

  // Trim a 16kHz Float32 PCM buffer to [startSec, endSec]. null = open.
  function _trimAudio(audio, startSec, endSec) {
    var sr = 16000;
    if ((startSec == null || startSec <= 0) && endSec == null) return audio;
    var s = startSec ? Math.max(0, Math.floor(startSec * sr)) : 0;
    var e = endSec   ? Math.min(audio.length, Math.floor(endSec * sr)) : audio.length;
    if (e <= s) throw new Error('טווח זמן לא חוקי — סיום לפני התחלה');
    return audio.slice(s, e);
  }

  // Build interleaved <p> blocks: "⏱ HH:MM:SS - תצלם את המסך" + body.
  // Groups consecutive Whisper chunks into ~30s paragraphs.
  function _buildTimestampedHtml(chunks, offsetSec, vidId, fallbackText) {
    offsetSec = offsetSec || 0;
    if (!chunks || !chunks.length) {
      // No timestamps available → fall back to plain paragraphs
      return (fallbackText || '').trim().split(/\n+/).map(function(p) {
        var t = p.trim();
        return t ? '<p style="direction:rtl;text-align:right;font-family:Arial,sans-serif;font-size:14px;line-height:1.9;margin:0 0 10px;unicode-bidi:plaintext;">' + _esc(t) + '</p>' : '';
      }).join('');
    }
    var GROUP_DUR = 30;
    var groups = [];
    var cur = null;
    for (var i = 0; i < chunks.length; i++) {
      var c = chunks[i];
      var ts = (c.timestamp && c.timestamp[0] != null) ? c.timestamp[0] : 0;
      if (!cur) { cur = { startSec: ts, texts: [c.text] }; }
      else if (ts - cur.startSec < GROUP_DUR) { cur.texts.push(c.text); }
      else { groups.push(cur); cur = { startSec: ts, texts: [c.text] }; }
    }
    if (cur) groups.push(cur);

    return groups.map(function(g) {
      var abs = g.startSec + offsetSec;
      var hms = _formatHMS(abs);
      var stamp;
      if (vidId) {
        stamp = '<a href="https://www.youtube.com/watch?v=' + _esc(vidId) +
                '&t=' + Math.floor(abs) + 's" ' +
                'style="color:#2d6f9c;text-decoration:none;font-weight:600;">' +
                '⏱ ' + hms + ' - תצלם את המסך</a>';
      } else {
        stamp = '<span style="color:#888;font-weight:600;">⏱ ' + hms + ' - תצלם את המסך</span>';
      }
      var body = _esc(g.texts.join('').trim());
      return '<p style="direction:rtl;text-align:right;font-family:Arial,sans-serif;font-size:14px;line-height:1.9;margin:0 0 14px;unicode-bidi:plaintext;">' +
             stamp + '<br>' + body + '</p>';
    }).join('');
  }

  // ── Cloud transcription via user-deployed Cloudflare Worker ──────────────
  // POSTs the raw audio file to the Worker, which calls Workers AI Whisper
  // (whisper-large-v3-turbo) on Cloudflare's GPUs and returns transcript JSON.
  // Returns the same { text, chunks } shape the local Whisper Worker produces.
  async function _transcribeViaWorker(workerUrl, fileBuffer, language, onProgress) {
    var url = workerUrl.replace(/\/+$/, '') + '/?language=' + encodeURIComponent(language || 'auto');
    var u8 = new Uint8Array(fileBuffer);
    var sizeMB = (u8.length / 1024 / 1024).toFixed(1);

    // Try streaming upload first (Chromium-only). Encodes base64 lazily as
    // the request body is being uploaded — no full base64 string in memory,
    // no idle timeout because bytes flow continuously. Falls back to
    // buffered upload on browsers that don't support duplex streams.
    var streamingSupported = (typeof ReadableStream === 'function');
    var r;

    if (streamingSupported) {
      try {
        if (onProgress) onProgress('שולח ' + sizeMB + ' MB ל-Cloudflare (streaming)…');
        // Each non-final chunk must be a multiple of 3 input bytes so the
        // resulting base64 chunks concatenate into valid base64.
        const CHUNK_INPUT = 30000;
        let pos = 0;
        const tenc = new TextEncoder();
        const stream = new ReadableStream({
          pull: function(controller) {
            if (pos >= u8.length) { controller.close(); return; }
            const end = Math.min(pos + CHUNK_INPUT, u8.length);
            const slice = u8.subarray(pos, end);
            let bin = '';
            for (let i = 0; i < slice.length; i++) bin += String.fromCharCode(slice[i]);
            controller.enqueue(tenc.encode(btoa(bin)));
            pos = end;
            if (onProgress) {
              const pct = Math.round((pos / u8.length) * 100);
              onProgress('שולח ' + sizeMB + ' MB ל-Cloudflare (streaming · ' + pct + '%)…');
            }
          }
        });
        r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: stream,
          duplex: 'half'
        });
      } catch (streamErr) {
        console.warn('[transcribe] stream upload failed, falling back to buffered:', streamErr);
        r = null;
      }
    }

    if (!r) {
      // Buffered fallback (Firefox / older Chromium). Builds the full base64
      // string in memory and sends it as a single body.
      if (onProgress) onProgress('מקודד base64 בדפדפן…');
      var audioBase64 = _arrayBufferToBase64(fileBuffer);
      if (onProgress) onProgress('שולח ' + (audioBase64.length / 1024 / 1024).toFixed(1) + ' MB ל-Cloudflare…');
      r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: audioBase64
      });
    }
    if (!r.ok) {
      var errBody = '';
      try { errBody = await r.text(); } catch (_) {}
      throw new Error('Worker שגיאה ' + r.status + ': ' + errBody.slice(0, 200));
    }
    if (onProgress) onProgress('הענן מתמלל ב-Whisper-Large-v3-Turbo…');
    var data = await r.json();
    if (data.error) throw new Error('Worker: ' + data.error);

    // Normalise to { text, chunks: [{timestamp:[s,e], text}] }
    var text = (data.text || '').trim();
    var chunks = [];

    if (Array.isArray(data.segments) && data.segments.length) {
      // OpenAI-style segment list
      chunks = data.segments.map(function(s){
        var st = (s.start != null ? s.start : 0);
        var en = (s.end   != null ? s.end   : st + 1);
        return { timestamp: [st, en], text: ' ' + (s.text || '').trim() };
      });
    } else if (Array.isArray(data.words) && data.words.length) {
      // Word-level → group every ~30s into a paragraph
      var GROUP = 30;
      var cur = null;
      for (var i = 0; i < data.words.length; i++) {
        var w  = data.words[i];
        var ws = (w.start != null ? w.start : (w.startTime || 0));
        var we = (w.end   != null ? w.end   : (w.endTime || ws));
        var wt = (w.word || w.text || '').trim();
        if (!cur || ws - cur.s > GROUP) {
          if (cur) chunks.push({ timestamp: [cur.s, cur.e], text: ' ' + cur.t.join(' ') });
          cur = { s: ws, e: we, t: [wt] };
        } else {
          cur.e = we; cur.t.push(wt);
        }
      }
      if (cur) chunks.push({ timestamp: [cur.s, cur.e], text: ' ' + cur.t.join(' ') });
    } else if (data.vtt && typeof data.vtt === 'string') {
      // WEBVTT fallback parsing
      var re = /(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})\n([\s\S]*?)(?=\n\n|\n*$)/g;
      var m;
      function _hmsToSec(hms) {
        var p = hms.split(':'); return parseInt(p[0])*3600 + parseInt(p[1])*60 + parseFloat(p[2]);
      }
      while ((m = re.exec(data.vtt)) !== null) {
        chunks.push({ timestamp: [_hmsToSec(m[1]), _hmsToSec(m[2])], text: ' ' + m[3].replace(/\n/g,' ').trim() });
      }
    }
    return { text: text, chunks: chunks, raw: data, detectedLanguage: (data.transcription_info && data.transcription_info.language) || null };
  }

  // Call the Worker's /translate endpoint (Llama-3 based) to translate a
  // block of text to a target language. Used when source audio's detected
  // language is not the user's preferred output language.
  async function _translateViaWorker(workerUrl, text, targetLang, onProgress) {
    var url = workerUrl.replace(/\/+$/, '') + '/translate';
    if (onProgress) onProgress('שולח טקסט לתרגום ל-' + (targetLang || 'he') + ' (Llama 3)…');
    var r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, target_language: targetLang || 'he' })
    });
    if (!r.ok) {
      var errBody = '';
      try { errBody = await r.text(); } catch(_) {}
      throw new Error('Worker translate שגיאה ' + r.status + ': ' + errBody.slice(0, 200));
    }
    var data = await r.json();
    if (data.error) throw new Error('Translate: ' + data.error);
    return {
      translation: (data.translation || '').trim(),
      targetLanguage: data.target_language,
      targetName: data.target_name
    };
  }

  // ── Audio decode + WAV encode (browser-side) ─────────────────────────────
  // Two-stage decode:
  //  (1) FAST: AudioContext.decodeAudioData on the raw bytes — works for
  //      MP3/WAV/M4A/OGG/FLAC. Native, instant.
  //  (2) FALLBACK: HTMLVideoElement playback at 16x + capture via WebAudio.
  //      Works for MP4/WebM/MOV video containers that decodeAudioData refuses.
  //      Real-time-bound (16x speedup) but reliable for any browser-playable file.
  async function _decodeAnyFileToPcm(file, onProgress) {
    const ab = await file.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    try {
      const decoded = await audioCtx.decodeAudioData(ab);
      const ch = decoded.numberOfChannels;
      let pcm;
      if (ch > 1) {
        const c0 = decoded.getChannelData(0);
        const c1 = decoded.getChannelData(1);
        pcm = new Float32Array(c0.length);
        for (let i = 0; i < c0.length; i++) pcm[i] = (c0[i] + c1[i]) * 0.5;
      } else {
        pcm = new Float32Array(decoded.getChannelData(0));
      }
      audioCtx.close();
      return { pcm: pcm, sampleRate: 16000, durationSec: pcm.length / 16000 };
    } catch (decodeErr) {
      try { audioCtx.close(); } catch (_) {}
      // Fallback for video / unusual containers
      if (onProgress) onProgress('פענוח ישיר נכשל — עובר ל-HTMLVideoElement (איטי יותר אבל עובד על MP4 וידאו)…');
      return _decodeViaVideoElement(file, onProgress);
    }
  }

  // Fallback decoder via real-time playback. Used for MP4/WebM/MOV that
  // decodeAudioData rejects. Plays the file at max playbackRate (16x in
  // most browsers) routed through a Web Audio graph that captures samples
  // into a Float32 buffer. Audio is silenced via GainNode(0).
  async function _decodeViaVideoElement(file, onProgress) {
    const blobUrl = URL.createObjectURL(file);
    const media = document.createElement('video');
    media.src = blobUrl;
    media.preload = 'auto';
    media.crossOrigin = 'anonymous';

    // Wait for the file to be ready to play
    await new Promise(function(resolve, reject) {
      let settled = false;
      function done(err) {
        if (settled) return;
        settled = true;
        if (err) { try { URL.revokeObjectURL(blobUrl); } catch (_) {} reject(err); }
        else resolve();
      }
      media.oncanplaythrough = function(){ done(); };
      media.onerror = function(){ done(new Error('הדפדפן לא הצליח לטעון את הקובץ (codec לא נתמך, או פגום)')); };
      try { media.load(); } catch (e) { done(e); }
      setTimeout(function(){ done(new Error('זמן טעינה ארוך מדי — נסה קובץ אחר')); }, 45000);
    });

    const duration = media.duration;
    if (!isFinite(duration) || duration === 0) {
      try { URL.revokeObjectURL(blobUrl); } catch (_) {}
      throw new Error('הקובץ לא מכיל אודיו תקין (משך לא ידוע)');
    }

    const sampleRate = 16000;
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: sampleRate });
    const source = audioCtx.createMediaElementSource(media);
    const gain = audioCtx.createGain();
    gain.gain.value = 0; // silent, but ScriptProcessor still fires
    const bufSize = 16384;
    const processor = audioCtx.createScriptProcessor(bufSize, 1, 1);

    const chunks = [];
    let totalSamples = 0;
    processor.onaudioprocess = function(ev) {
      const inBuf = ev.inputBuffer;
      const ch = inBuf.numberOfChannels;
      let mono;
      if (ch > 1) {
        const c0 = inBuf.getChannelData(0);
        const c1 = inBuf.getChannelData(1);
        mono = new Float32Array(c0.length);
        for (let i = 0; i < c0.length; i++) mono[i] = (c0[i] + c1[i]) * 0.5;
      } else {
        mono = new Float32Array(inBuf.getChannelData(0));
      }
      chunks.push(mono);
      totalSamples += mono.length;
    };

    source.connect(processor);
    processor.connect(gain);
    gain.connect(audioCtx.destination);

    try { media.playbackRate = 16; } catch (_) {}
    await media.play();

    // Progress reporter while playing back
    let progressTimer = null;
    if (onProgress) {
      progressTimer = setInterval(function(){
        const pct = duration ? (media.currentTime / duration) * 100 : 0;
        const remainingWall = (duration - media.currentTime) / (media.playbackRate || 1);
        onProgress('פורק וידאו: ' + pct.toFixed(0) + '% · נשארו ~' + Math.max(0, Math.round(remainingWall)) + ' שנ׳');
      }, 1000);
    }

    await new Promise(function(resolve){ media.onended = resolve; });

    if (progressTimer) clearInterval(progressTimer);
    try { processor.disconnect(); source.disconnect(); gain.disconnect(); } catch (_) {}
    try { await audioCtx.close(); } catch (_) {}
    try { URL.revokeObjectURL(blobUrl); } catch (_) {}

    if (totalSamples === 0) {
      throw new Error('לא נקלטו דגימות אודיו — ייתכן שלקובץ אין פסקול');
    }
    const pcm = new Float32Array(totalSamples);
    let off = 0;
    for (let i = 0; i < chunks.length; i++) {
      pcm.set(chunks[i], off);
      off += chunks[i].length;
    }
    return { pcm: pcm, sampleRate: sampleRate, durationSec: pcm.length / sampleRate };
  }

  // ── MP3 byte-slice path (no full decode required) ───────────────────────
  // For long CBR MP3 files (e.g. 256kbps × 45 min = 82MB), Chrome's
  // decodeAudioData often fails — and the HTMLVideoElement fallback is too
  // slow / can truncate. Byte-slicing reads the original bytes, finds frame
  // boundaries, and produces valid MP3 sub-files for any time range.

  function _skipID3v2(bytes) {
    if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
      const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) |
                   ((bytes[8] & 0x7f) << 7)  |  (bytes[9] & 0x7f);
      return 10 + size;
    }
    return 0;
  }

  function _findMp3FrameNear(bytes, from, range) {
    range = range || 65536;
    const len = bytes.length - 4;
    const fwdEnd = Math.min(len, from + range);
    for (let i = Math.max(0, from); i < fwdEnd; i++) {
      // Sync 11 bits + non-reserved version + non-reserved layer
      if (bytes[i] === 0xFF &&
          (bytes[i+1] & 0xE0) === 0xE0 &&
          (bytes[i+1] & 0x18) !== 0x08 &&  // not reserved version
          (bytes[i+1] & 0x06) !== 0x00) {  // not reserved layer
        return i;
      }
    }
    const backStart = Math.max(0, from - range);
    for (let i = Math.min(from - 1, len - 1); i >= backStart; i--) {
      if (bytes[i] === 0xFF &&
          (bytes[i+1] & 0xE0) === 0xE0 &&
          (bytes[i+1] & 0x18) !== 0x08 &&
          (bytes[i+1] & 0x06) !== 0x00) {
        return i;
      }
    }
    return -1;
  }

  function _parseMp3FrameHeader(bytes, offset) {
    if (bytes.length < offset + 4) return null;
    if (bytes[offset] !== 0xFF) return null;
    if ((bytes[offset+1] & 0xE0) !== 0xE0) return null;

    const b1 = bytes[offset + 1];
    const b2 = bytes[offset + 2];
    const versionId    = (b1 >> 3) & 0x03;   // 0=2.5, 1=res, 2=2, 3=1
    const layer        = (b1 >> 1) & 0x03;   // 1=L3, 2=L2, 3=L1
    const bitrateIdx   = (b2 >> 4) & 0x0F;
    const samplerateIdx= (b2 >> 2) & 0x03;
    if (versionId === 1 || layer === 0) return null;
    if (bitrateIdx === 0 || bitrateIdx === 0x0F) return null;
    if (samplerateIdx === 3) return null;
    if (layer !== 1) return null;  // Layer III only

    const BR_M1_L3 = [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0];
    const BR_M2_L3 = [0, 8,16,24,32,40,48,56, 64, 80, 96,112,128,144,160,0];
    const SR_M1  = [44100, 48000, 32000];
    const SR_M2  = [22050, 24000, 16000];
    const SR_M25 = [11025, 12000,  8000];

    let bitrate, sampleRate;
    if (versionId === 3)      { bitrate = BR_M1_L3[bitrateIdx] * 1000; sampleRate = SR_M1[samplerateIdx]; }
    else if (versionId === 2) { bitrate = BR_M2_L3[bitrateIdx] * 1000; sampleRate = SR_M2[samplerateIdx]; }
    else                      { bitrate = BR_M2_L3[bitrateIdx] * 1000; sampleRate = SR_M25[samplerateIdx]; }
    if (!bitrate || !sampleRate) return null;
    return { bitrate: bitrate, sampleRate: sampleRate, versionId: versionId };
  }

  // Parse Xing/Info VBR header inside the first MP3 frame.
  // Returns { frames, audioBytes } or null. Lets us compute accurate duration
  // for VBR files where bytes/sec varies.
  function _parseXingHeader(bytes, frameOffset, header) {
    const channelMode = (bytes[frameOffset + 3] >> 6) & 0x03;
    const isMono = (channelMode === 3);
    // Side-info length depends on MPEG version + channel mode
    let sideInfoLen;
    if (header.versionId === 3) {            // MPEG1
      sideInfoLen = isMono ? 17 : 32;
    } else {                                  // MPEG2 / 2.5
      sideInfoLen = isMono ? 9 : 17;
    }
    const off = frameOffset + 4 + sideInfoLen;
    if (off + 8 > bytes.length) return null;
    // "Xing" (CBR-padded) or "Info" (true VBR)
    const isXing = bytes[off]   === 0x58 && bytes[off+1] === 0x69 &&
                   bytes[off+2] === 0x6E && bytes[off+3] === 0x67;
    const isInfo = bytes[off]   === 0x49 && bytes[off+1] === 0x6E &&
                   bytes[off+2] === 0x66 && bytes[off+3] === 0x6F;
    if (!isXing && !isInfo) return null;

    const flags = (bytes[off+4] << 24) | (bytes[off+5] << 16) |
                  (bytes[off+6] << 8)  |  bytes[off+7];
    let pos = off + 8;
    let frames = 0, audioBytes = 0;
    if (flags & 0x01) {
      frames = (bytes[pos] << 24) | (bytes[pos+1] << 16) | (bytes[pos+2] << 8) | bytes[pos+3];
      pos += 4;
    }
    if (flags & 0x02) {
      audioBytes = (bytes[pos] << 24) | (bytes[pos+1] << 16) | (bytes[pos+2] << 8) | bytes[pos+3];
      pos += 4;
    }
    return { frames: frames, audioBytes: audioBytes, kind: isXing ? 'Xing' : 'Info' };
  }

  // Read full MP3 file, parse header, compute duration. Accepts CBR + VBR.
  // Returns { bytes, bitrate, sampleRate, durationSec, dataStart, bytesPerSec, isVbr }
  // or null if file isn't a usable MP3.
  async function _readMp3Metadata(file) {
    const ext = ((file.name || '').match(/\.[^.]+$/) || [''])[0].toLowerCase();
    if (ext !== '.mp3') return null;
    const ab = await file.arrayBuffer();
    const bytes = new Uint8Array(ab);
    const id3End = _skipID3v2(bytes);
    const firstFrame = _findMp3FrameNear(bytes, id3End, 1024 * 1024);
    if (firstFrame < 0) return null;
    const header = _parseMp3FrameHeader(bytes, firstFrame);
    if (!header) return null;

    let bitrate;
    let durationSec;
    let isVbr = false;
    let bytesPerSec;
    let dataStart = firstFrame;

    // Try Xing/Info header first — gives accurate VBR metrics
    const xing = _parseXingHeader(bytes, firstFrame, header);
    if (xing && xing.frames > 0) {
      const samplesPerFrame = (header.versionId === 3) ? 1152 : 576;
      durationSec = (xing.frames * samplesPerFrame) / header.sampleRate;
      const audioBytes = xing.audioBytes > 0 ? xing.audioBytes : (bytes.length - firstFrame);
      bitrate = (audioBytes * 8) / durationSec;
      bytesPerSec = audioBytes / durationSec;
      isVbr = (xing.kind === 'Xing');  // "Info" tag means CBR with header
      // Skip the Xing frame itself when computing time→byte (it's silent)
      // First "real" audio frame is right after the Xing frame.
      const xingFrameEnd = firstFrame + _mp3FrameLen(bytes, firstFrame, header);
      const nextFrame = _findMp3FrameNear(bytes, xingFrameEnd, 65536);
      if (nextFrame > firstFrame) dataStart = nextFrame;
    } else {
      // No Xing header → estimate from sampled bitrates
      const sampleBitrates = [header.bitrate];
      for (let f = 1; f <= 6; f++) {
        const pos = firstFrame + Math.floor((bytes.length - firstFrame) * f / 7);
        const fr = _findMp3FrameNear(bytes, pos, 65536);
        if (fr >= 0) {
          const h = _parseMp3FrameHeader(bytes, fr);
          if (h && h.bitrate) sampleBitrates.push(h.bitrate);
        }
      }
      bitrate = sampleBitrates.reduce(function(a, b){ return a + b; }, 0) / sampleBitrates.length;
      const audioBytes = bytes.length - firstFrame;
      bytesPerSec = bitrate / 8;
      durationSec = audioBytes / bytesPerSec;
      // Mark as VBR if any sample deviates >5% from the average
      isVbr = sampleBitrates.some(function(b){ return Math.abs(b - bitrate) > bitrate * 0.05; });
    }

    return {
      bytes: bytes,
      bitrate: bitrate,
      sampleRate: header.sampleRate,
      durationSec: durationSec,
      dataStart: dataStart,
      bytesPerSec: bytesPerSec,
      isVbr: isVbr
    };
  }

  // Length in bytes of the MP3 frame at `offset`. Used to skip the Xing
  // sentinel frame so it doesn't show up as silence at second 0.
  function _mp3FrameLen(bytes, offset, header) {
    const samplesPerFrame = (header.versionId === 3) ? 1152 : 576;
    const padding = (bytes[offset + 2] >> 1) & 0x01;
    return Math.floor((samplesPerFrame * header.bitrate) / (8 * header.sampleRate)) + padding;
  }

  // Slice an MP3 by time range. Returns ArrayBuffer of valid MP3 bytes.
  function _sliceMp3ByTimeBytes(mp3meta, startSec, endSec) {
    const startByte = mp3meta.dataStart + Math.floor(startSec * mp3meta.bytesPerSec);
    const endByte   = mp3meta.dataStart + Math.floor(endSec   * mp3meta.bytesPerSec);
    const realStart = _findMp3FrameNear(mp3meta.bytes, startByte, 65536);
    const realEnd   = _findMp3FrameNear(mp3meta.bytes, endByte,   65536);
    if (realStart < 0 || realEnd < 0 || realEnd <= realStart) {
      throw new Error('לא הצלחתי למצוא גבולות frame תקינים בטווח המבוקש');
    }
    return mp3meta.bytes.buffer.slice(realStart, realEnd);
  }

  // Transcribe an MP3 by byte-slicing (no decode required). Splits the
  // requested range into ≤90MB pieces at frame boundaries, uploads each to
  // the Worker, and stitches the transcripts back with cumulative offsets.
  async function _transcribeMp3ByteSliced(workerUrl, mp3meta, startSec, endSec, language, onProgress) {
    const startByte = mp3meta.dataStart + Math.floor(startSec * mp3meta.bytesPerSec);
    const endByte   = mp3meta.dataStart + Math.floor(endSec   * mp3meta.bytesPerSec);
    const sliceStart = _findMp3FrameNear(mp3meta.bytes, startByte, 65536);
    const sliceEnd   = _findMp3FrameNear(mp3meta.bytes, endByte,   65536);
    if (sliceStart < 0 || sliceEnd <= sliceStart) {
      throw new Error('לא הצלחתי למצוא גבולות frame תקינים');
    }

    // 3MB binary → 4MB base64 string → ~12MB peak browser RAM during encode.
    // Larger chunks (we tried 20MB = ~80MB peak) trigger memory pressure on
    // low-RAM machines and the browser silently aborts fetch with "Failed to
    // fetch" — even though the Worker can handle 30MB+ once the bytes arrive.
    const CHUNK_BYTES = 3 * 1024 * 1024;
    const sliceLen = sliceEnd - sliceStart;
    const boundaries = [];
    if (sliceLen <= CHUNK_BYTES) {
      boundaries.push([sliceStart, sliceEnd]);
    } else {
      let pos = sliceStart;
      while (pos < sliceEnd) {
        const target = Math.min(sliceEnd, pos + CHUNK_BYTES);
        const realEnd = (target >= sliceEnd) ? sliceEnd : _findMp3FrameNear(mp3meta.bytes, target, 65536);
        if (realEnd <= pos) break;
        boundaries.push([pos, realEnd]);
        pos = realEnd;
      }
    }

    const allText = [];
    const allChunks = [];
    let _firstLang = null;
    for (let i = 0; i < boundaries.length; i++) {
      const cs = boundaries[i][0], ce = boundaries[i][1];
      const chunkBytes = mp3meta.bytes.buffer.slice(cs, ce);
      const chunkStartSec = startSec + (cs - sliceStart) / mp3meta.bytesPerSec;
      const chunkSizeMB = (chunkBytes.byteLength / 1024 / 1024).toFixed(1);
      const partTag = boundaries.length === 1
        ? '(' + chunkSizeMB + ' MB)'
        : 'חלק ' + (i + 1) + '/' + boundaries.length + ' (' + chunkSizeMB + ' MB · התקדמות ~' + Math.round(((i) / boundaries.length) * 100) + '%)';

      // Up to 3 attempts per chunk with backoff — Cloudflare's free tier
      // CPU/rate limits sometimes flake under load, but a brief pause and
      // a retry usually clears it.
      let result = null;
      let lastErr = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const tryTag = attempt === 1 ? partTag : partTag + ' · ניסיון ' + attempt + '/3';
        if (onProgress) onProgress(tryTag + ' · שולח לענן…');
        try {
          result = await _transcribeViaWorker(workerUrl, chunkBytes, language, function(msg){
            if (onProgress) onProgress(tryTag + ' · ' + msg);
          });
          break;
        } catch (chunkErr) {
          lastErr = chunkErr;
          if (attempt < 3) {
            if (onProgress) onProgress(partTag + ' · ⚠️ נכשל (' + chunkErr.message + ') — ממתין ' + (attempt * 3) + ' שנ׳ ומנסה שוב…');
            await new Promise(function(r){ setTimeout(r, attempt * 3000); });
          }
        }
      }
      if (!result) {
        var hint = (lastErr && lastErr.message === 'Failed to fetch')
          ? ' (3 ניסיונות נכשלו · Cloudflare Worker מגיע ל-CPU limit · עדכון ל-Worker v4 יפתור סופית)'
          : '';
        throw new Error('כשל בחלק ' + (i + 1) + '/' + boundaries.length + ' אחרי 3 ניסיונות: ' + (lastErr ? lastErr.message : 'unknown') + hint);
      }
      allText.push((result.text || '').trim());
      if (Array.isArray(result.chunks)) {
        for (let j = 0; j < result.chunks.length; j++) {
          const c = result.chunks[j];
          allChunks.push({
            timestamp: [c.timestamp[0] + chunkStartSec, c.timestamp[1] + chunkStartSec],
            text: c.text
          });
        }
      }
      // Capture detected language from the first chunk
      if (i === 0 && result.detectedLanguage) {
        _firstLang = result.detectedLanguage;
      }
      // Brief pacing between chunks to avoid edge rate-limit
      if (i < boundaries.length - 1) {
        await new Promise(function(r){ setTimeout(r, 800); });
      }
    }
    return {
      text: allText.filter(Boolean).join(' '),
      chunks: allChunks,
      detectedLanguage: _firstLang
    };
  }

  function _slicePcmSec(pcm, startSec, endSec, sampleRate) {
    const start = Math.max(0, Math.floor((startSec || 0) * sampleRate));
    const end   = Math.min(pcm.length, Math.floor((endSec || (pcm.length / sampleRate)) * sampleRate));
    return pcm.slice(start, end);
  }

  function _pcmToWavBytes(pcm, sampleRate) {
    const n = pcm.length;
    const buffer = new ArrayBuffer(44 + n * 2);
    const view = new DataView(buffer);
    function writeStr(o, s) { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); }
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + n * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, n * 2, true);
    let offset = 44;
    for (let i = 0; i < n; i++) {
      const s = Math.max(-1, Math.min(1, pcm[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
    return buffer;
  }

  // Chunked Whisper-via-Worker. ~1.5-min PCM pieces → ~2.9MB WAV each → safe
  // for low-RAM machines where the browser silently aborts fetch under
  // memory pressure.
  async function _transcribeViaWorkerChunked(workerUrl, pcm, sampleRate, language, onProgress) {
    const totalSec = pcm.length / sampleRate;
    const CHUNK_DUR = 90;  // 1.5 min per chunk → ~2.9MB WAV
    const boundaries = [];
    for (let s = 0; s < totalSec; s += CHUNK_DUR) {
      boundaries.push([s, Math.min(totalSec, s + CHUNK_DUR)]);
    }
    if (!boundaries.length) boundaries.push([0, 0]);

    const allText = [];
    const allChunks = [];
    let _firstLang = null;
    for (let i = 0; i < boundaries.length; i++) {
      const [s, e] = boundaries[i];
      const headLine = boundaries.length === 1
        ? 'שולח לענן…'
        : 'חלק ' + (i + 1) + '/' + boundaries.length + ' (' + _formatHMS(s) + '–' + _formatHMS(e) + ')…';
      if (onProgress) onProgress(headLine);

      const slice = _slicePcmSec(pcm, s, e, sampleRate);
      const wavBytes = _pcmToWavBytes(slice, sampleRate);
      const result = await _transcribeViaWorker(workerUrl, wavBytes, language, onProgress);
      allText.push((result.text || '').trim());
      if (Array.isArray(result.chunks)) {
        for (const c of result.chunks) {
          allChunks.push({
            timestamp: [c.timestamp[0] + s, c.timestamp[1] + s],
            text: c.text
          });
        }
      }
      if (i === 0 && result.detectedLanguage) _firstLang = result.detectedLanguage;
    }
    return { text: allText.filter(Boolean).join(' '), chunks: allChunks, detectedLanguage: _firstLang };
  }

  // Quick health check — returns true if Worker URL responds (any 2xx/4xx OK)
  async function _pingWorker(workerUrl) {
    try {
      var r = await fetch(workerUrl.replace(/\/+$/, '') + '/', { method: 'OPTIONS' });
      return r.ok || r.status === 204;
    } catch (_) { return false; }
  }

  // Pre-flight test: send a tiny 5MB silent payload to the Worker. If this
  // fails, transcription is going to fail too — surface a precise reason
  // (CPU/RAM cap → deploy Worker v4) instead of a generic "Failed to fetch"
  // halfway through chunk 1.
  async function _preflightWorker(workerUrl, sizeMB, onProgress) {
    sizeMB = sizeMB || 5;
    if (onProgress) onProgress('בודק חיבור ל-Worker עם payload של ' + sizeMB + 'MB…');
    // Build a silent WAV at 16kHz mono, sized roughly to sizeMB
    const samples = sizeMB * 1024 * 1024 / 2;  // int16 = 2 bytes/sample
    const pcm = new Float32Array(Math.floor(samples));  // all zeros = silence
    const wavBuf = _pcmToWavBytes(pcm, 16000);
    try {
      const r = await fetch(workerUrl.replace(/\/+$/, '') + '/?language=he', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: wavBuf
      });
      if (!r.ok) {
        const txt = await r.text().catch(function(){ return ''; });
        return { ok: false, code: r.status, body: txt.slice(0, 300) };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, fetchErr: e.message };
    }
  }

  // base64-encode an ArrayBuffer in chunks (avoids the 64KB stack limit of
  // String.fromCharCode.apply when the buffer is large).
  function _arrayBufferToBase64(buf) {
    const u8 = new Uint8Array(buf);
    const chunkSize = 0x8000;
    const parts = [];
    for (let i = 0; i < u8.length; i += chunkSize) {
      parts.push(String.fromCharCode.apply(null, u8.subarray(i, i + chunkSize)));
    }
    return btoa(parts.join(''));
  }

  // POST a YouTube URL to the Worker /youtube endpoint — Worker fetches the
  // audio from YouTube directly (zero load on user's machine) and runs Whisper.
  async function _transcribeYouTubeViaWorker(workerUrl, ytUrl, language, onProgress) {
    var url = workerUrl.replace(/\/+$/, '') + '/youtube';
    if (onProgress) onProgress('מבקש מ-Cloudflare למשוך אודיו מ-YouTube…');
    var r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: ytUrl, language: language || 'he' })
    });
    if (!r.ok) {
      var errBody = '';
      try { errBody = await r.text(); } catch (_) {}
      var msg = errBody;
      try { var j = JSON.parse(errBody); if (j.error) msg = j.error; } catch (_) {}
      throw new Error((msg || 'Worker שגיאה ' + r.status).slice(0, 250));
    }
    if (onProgress) onProgress('הענן מתמלל ב-Whisper-Large-v3-Turbo…');
    var data = await r.json();
    if (data.error) throw new Error(data.error);

    var text = (data.text || '').trim();
    var chunks = [];
    if (Array.isArray(data.segments) && data.segments.length) {
      chunks = data.segments.map(function(s){
        var st = (s.start != null ? s.start : 0);
        var en = (s.end   != null ? s.end   : st + 1);
        return { timestamp: [st, en], text: ' ' + (s.text || '').trim() };
      });
    }
    return { text: text, chunks: chunks, video: data.video || null, raw: data };
  }

  // File System Access API — let the user pick where to save. Falls back to
  // a normal anchor download in browsers that don't support the picker.
  // opts: { description, extension, mimeType }
  async function _saveBlobViaPicker(blob, suggestedName, opts) {
    opts = opts || {};
    var description = opts.description || 'File';
    var ext = opts.extension || ((suggestedName.match(/\.[^.]+$/) || ['.bin'])[0]);
    var mime = opts.mimeType || blob.type || 'application/octet-stream';
    if (window.showSaveFilePicker) {
      try {
        var accept = {}; accept[mime] = [ext];
        var handle = await window.showSaveFilePicker({
          suggestedName: suggestedName,
          types: [{ description: description, accept: accept }]
        });
        var writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return { method: 'picker', name: handle.name };
      } catch (err) {
        if (err && err.name === 'AbortError') return { method: 'cancelled' };
      }
    }
    var blobUrl = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = blobUrl; a.download = suggestedName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(blobUrl); }, 3000);
    return { method: 'download', name: suggestedName };
  }
  function _saveDocViaPicker(blob, suggestedName) {
    return _saveBlobViaPicker(blob, suggestedName, {
      description: 'Word Document', extension: '.doc', mimeType: 'application/msword'
    });
  }
  function _saveWavViaPicker(blob, suggestedName) {
    return _saveBlobViaPicker(blob, suggestedName, {
      description: 'WAV audio', extension: '.wav', mimeType: 'audio/wav'
    });
  }
  function _saveMp3ViaPicker(blob, suggestedName) {
    return _saveBlobViaPicker(blob, suggestedName, {
      description: 'MP3 audio', extension: '.mp3', mimeType: 'audio/mpeg'
    });
  }
  function _saveVideoViaPicker(blob, suggestedName, ext) {
    ext = ext || '.webm';
    var mime = ext === '.mp4' ? 'video/mp4' : 'video/webm';
    return _saveBlobViaPicker(blob, suggestedName, {
      description: ext === '.mp4' ? 'MP4 video' : 'WebM video',
      extension: ext, mimeType: mime
    });
  }

  // ── Video cut: re-record a time range from a video file via MediaRecorder
  // Plays the video at 1x in real time, captures the stream (video + audio),
  // and writes a WebM (or MP4 where the browser supports it) for the slice.
  // Real-time bound: a 5-min slice takes 5 minutes of wall clock to record.
  // ── ffmpeg.wasm loader (lazy: only loads when first used) ────────────────
  // Single-threaded core for GitHub Pages compatibility (no SharedArrayBuffer).
  // All cross-origin assets (including the worker JS chunk that ffmpeg spawns
  // internally) are pre-fetched and converted to same-origin Blob URLs via
  // toBlobURL, otherwise the browser blocks `new Worker()` with
  // "Script ... cannot be accessed from origin ...".
  let _ffmpegInstance = null;
  let _ffmpegLoading = null;
  async function _loadFfmpeg(onProgress) {
    if (_ffmpegInstance) return _ffmpegInstance;
    if (_ffmpegLoading) return _ffmpegLoading;
    _ffmpegLoading = (async function() {
      function loadScript(src) {
        return new Promise(function(resolve, reject) {
          var s = document.createElement('script');
          s.src = src; s.async = true;
          s.onload = function(){ resolve(); };
          s.onerror = function(){ reject(new Error('Failed to load ' + src)); };
          document.head.appendChild(s);
        });
      }

      const ffmpegBaseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd';
      const coreBaseURL   = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd';
      const utilBaseURL   = 'https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/umd';

      if (onProgress) onProgress('טוען ffmpeg.wasm (פעם אחת, ~30MB)…');
      if (!window.FFmpegWASM) await loadScript(ffmpegBaseURL + '/ffmpeg.js');
      if (!window.FFmpegUtil) await loadScript(utilBaseURL + '/index.js');

      const FFmpeg    = window.FFmpegWASM && window.FFmpegWASM.FFmpeg;
      const toBlobURL = window.FFmpegUtil && window.FFmpegUtil.toBlobURL;
      if (!FFmpeg)    throw new Error('FFmpeg class לא נטען');
      if (!toBlobURL) throw new Error('toBlobURL לא נטען (חבילת @ffmpeg/util)');

      const ffmpeg = new FFmpeg();
      ffmpeg.on('log', function(e){ if (e && e.message) console.log('[ffmpeg]', e.message); });

      if (onProgress) onProgress('מוריד core + worker (~25MB) ועוטף ב-Blob URLs לעקיפת CORS…');

      // Pre-fetch all cross-origin assets and wrap as Blob URLs so the
      // internally-spawned Worker passes browser same-origin checks.
      const results = await Promise.all([
        toBlobURL(coreBaseURL   + '/ffmpeg-core.js',   'text/javascript'),
        toBlobURL(coreBaseURL   + '/ffmpeg-core.wasm', 'application/wasm'),
        toBlobURL(ffmpegBaseURL + '/814.ffmpeg.js',    'text/javascript')
      ]);
      const coreURL = results[0], wasmURL = results[1], workerURL = results[2];

      if (onProgress) onProgress('מאתחל ffmpeg…');
      await ffmpeg.load({
        coreURL:        coreURL,
        wasmURL:        wasmURL,
        classWorkerURL: workerURL
      });

      _ffmpegInstance = ffmpeg;
      if (onProgress) onProgress('ffmpeg מוכן ✓');
      return ffmpeg;
    })().catch(function(err){
      _ffmpegLoading = null;  // allow retry on next call
      throw err;
    });
    return _ffmpegLoading;
  }

  // Concatenate ordered video files into a single MP4 (stream copy when
  // possible, re-encode fallback). Runs entirely in the Worker; main thread
  // stays free.
  async function _mergeVideos(files, onProgress) {
    if (!files || files.length < 2) throw new Error('צריך לפחות 2 סרטונים');
    const ffmpeg = await _loadFfmpeg(onProgress);

    // Write inputs into ffmpeg FS
    const inputNames = [];
    for (let i = 0; i < files.length; i++) {
      if (onProgress) {
        onProgress('מעלה ל-ffmpeg ' + (i + 1) + '/' + files.length + ': ' +
                   files[i].name + ' (' + (files[i].size / 1024 / 1024).toFixed(1) + ' MB)…');
      }
      const ext = ((files[i].name.match(/\.[^.]+$/) || ['.mp4'])[0]).toLowerCase();
      const name = 'in_' + i + ext;
      const buf = new Uint8Array(await files[i].arrayBuffer());
      await ffmpeg.writeFile(name, buf);
      inputNames.push(name);
    }

    // concat list (ffmpeg concat demuxer format)
    const listText = inputNames.map(function(n){ return "file '" + n + "'"; }).join('\n');
    await ffmpeg.writeFile('concat_list.txt', new TextEncoder().encode(listText));

    // Track ffmpeg progress events
    let lastPct = 0;
    const onProg = function(e){
      if (e && typeof e.progress === 'number') {
        lastPct = Math.max(0, Math.min(100, e.progress * 100));
        if (onProgress) onProgress('ffmpeg מעבד: ' + lastPct.toFixed(0) + '%');
      }
    };
    ffmpeg.on('progress', onProg);

    let success = false;
    try {
      // Try stream copy first — fast, lossless, low CPU
      if (onProgress) onProgress('מנסה איחוד מהיר (stream copy, ללא re-encoding)…');
      try {
        await ffmpeg.exec([
          '-f', 'concat', '-safe', '0', '-i', 'concat_list.txt',
          '-c', 'copy', '-movflags', '+faststart', 'output.mp4'
        ]);
        success = true;
      } catch (firstErr) {
        // Fall back to re-encoding (slower, but works for mismatched codecs)
        if (onProgress) onProgress('stream copy נכשל (קודקים לא תואמים) — מבצע re-encoding…');
        await ffmpeg.exec([
          '-f', 'concat', '-safe', '0', '-i', 'concat_list.txt',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
          '-c:a', 'aac', '-b:a', '128k',
          '-movflags', '+faststart', 'output.mp4'
        ]);
        success = true;
      }
    } finally {
      try { ffmpeg.off('progress', onProg); } catch (_) {}
    }
    if (!success) throw new Error('ffmpeg concat failed');

    if (onProgress) onProgress('קורא קובץ פלט…');
    const data = await ffmpeg.readFile('output.mp4');
    const blob = new Blob([data.buffer], { type: 'video/mp4' });

    // Cleanup ffmpeg FS
    for (const n of inputNames) { try { await ffmpeg.deleteFile(n); } catch (_) {} }
    try { await ffmpeg.deleteFile('concat_list.txt'); } catch (_) {}
    try { await ffmpeg.deleteFile('output.mp4'); } catch (_) {}

    return blob;
  }

  async function _cutVideoClip(file, startSec, endSec, onProgress) {
    // Use ffmpeg.wasm with stream copy — completes in seconds, not real time.
    const ffmpeg = await _loadFfmpeg(onProgress);

    const ext = ((file.name.match(/\.[^.]+$/) || ['.mp4'])[0]).toLowerCase();
    const inputName = 'cut_input' + ext;
    const outputName = 'cut_output.mp4';

    if (onProgress) onProgress('מעלה ל-ffmpeg ' + (file.size / 1024 / 1024).toFixed(1) + ' MB…');
    const buf = new Uint8Array(await file.arrayBuffer());
    await ffmpeg.writeFile(inputName, buf);

    const duration = endSec - startSec;
    const onProg = function(e) {
      if (e && typeof e.progress === 'number') {
        const pct = Math.max(0, Math.min(100, e.progress * 100));
        if (onProgress) onProgress('חותך: ' + pct.toFixed(0) + '%');
      }
    };
    ffmpeg.on('progress', onProg);

    function cleanup() {
      try { ffmpeg.off('progress', onProg); } catch (_) {}
      try { ffmpeg.deleteFile(inputName); } catch (_) {}
      try { ffmpeg.deleteFile(outputName); } catch (_) {}
    }

    try {
      // Stream copy first (fast, lossless). Input-side -ss is fast but seeks
      // to nearest keyframe — for cuts of seconds-long this is fine.
      if (onProgress) onProgress('מבצע חיתוך מהיר (stream copy, ללא re-encoding)…');
      try {
        await ffmpeg.exec([
          '-ss', String(startSec),
          '-i', inputName,
          '-t', String(duration),
          '-c', 'copy',
          '-avoid_negative_ts', 'make_zero',
          '-movflags', '+faststart',
          outputName
        ]);
      } catch (firstErr) {
        if (onProgress) onProgress('stream copy נכשל — re-encoding (איטי יותר)…');
        await ffmpeg.exec([
          '-i', inputName,
          '-ss', String(startSec),
          '-t', String(duration),
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
          '-c:a', 'aac', '-b:a', '128k',
          '-movflags', '+faststart',
          outputName
        ]);
      }

      if (onProgress) onProgress('קורא קובץ פלט…');
      const data = await ffmpeg.readFile(outputName);
      const blob = new Blob([data.buffer], { type: 'video/mp4' });
      cleanup();
      return {
        blob: blob,
        ext: '.mp4',
        mimeType: 'video/mp4',
        sizeMB: (blob.size / 1024 / 1024).toFixed(1)
      };
    } catch (e) {
      cleanup();
      throw e;
    }
  }

  // Legacy MediaRecorder-based cut (kept as reference, not used)
  async function _cutVideoClipLegacy(file, startSec, endSec, onProgress) {
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('הדפדפן הזה לא תומך ב-MediaRecorder — נסה Chrome/Brave/Edge עדכניים');
    }
    var blobUrl = URL.createObjectURL(file);
    var video = document.createElement('video');
    video.src = blobUrl;
    video.preload = 'auto';
    video.muted = false;
    video.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;';
    document.body.appendChild(video);

    var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    var audioSource = audioCtx.createMediaElementSource(video);
    var audioDest = audioCtx.createMediaStreamDestination();
    audioSource.connect(audioDest);

    function cleanup() {
      try { URL.revokeObjectURL(blobUrl); } catch (_) {}
      try { video.remove(); } catch (_) {}
      try { audioCtx.close(); } catch (_) {}
    }

    try {
      // Wait for metadata + data ready
      await new Promise(function(resolve, reject) {
        var settled = false;
        function done(err) {
          if (settled) return; settled = true;
          if (err) reject(err); else resolve();
        }
        video.oncanplay = function(){ done(); };
        video.onerror = function(){ done(new Error('הדפדפן לא הצליח לטעון את הקובץ הזה כוידאו')); };
        try { video.load(); } catch (e) { done(e); }
        setTimeout(function(){ done(new Error('זמן טעינה ארוך מדי')); }, 30000);
      });

      if (!isFinite(video.duration) || video.duration === 0) {
        throw new Error('הקובץ לא מכיל משך תקין');
      }
      if (endSec > video.duration + 0.5) {
        throw new Error('זמן סיום (' + endSec + ') חורג ממשך הקובץ (' + video.duration.toFixed(1) + ')');
      }

      // captureStream: prefer standard, fallback to mozCaptureStream
      var srcStream = (typeof video.captureStream === 'function')
        ? video.captureStream()
        : (typeof video.mozCaptureStream === 'function' ? video.mozCaptureStream() : null);
      if (!srcStream) throw new Error('captureStream לא נתמך בדפדפן הזה');

      // Combine: video tracks from captureStream + audio track from Web Audio
      // (the captureStream's audio track is empty since createMediaElementSource
      // captured the element's audio exclusively into the Web Audio graph)
      var stream = new MediaStream(
        [].concat(srcStream.getVideoTracks(), audioDest.stream.getAudioTracks())
      );

      // Pick best supported MIME type (WebM/Opus is usually safest)
      var mimeCandidates = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4;codecs=h264,aac',
        'video/mp4'
      ];
      var mimeType = '';
      for (var mi = 0; mi < mimeCandidates.length; mi++) {
        if (MediaRecorder.isTypeSupported(mimeCandidates[mi])) { mimeType = mimeCandidates[mi]; break; }
      }
      if (!mimeType) throw new Error('אף mime type של MediaRecorder לא נתמך');

      var recorder = new MediaRecorder(stream, { mimeType: mimeType });
      var chunks = [];
      recorder.ondataavailable = function(e) { if (e.data && e.data.size > 0) chunks.push(e.data); };

      // Seek to start
      video.currentTime = startSec;
      await new Promise(function(r){ video.onseeked = r; });

      // Start recording, then play. Stop when we've passed endSec.
      var recPromise = new Promise(function(resolve, reject) {
        recorder.onstop = resolve;
        recorder.onerror = reject;
      });
      recorder.start(250);  // emit chunks every 250ms (more accurate stop)

      await video.play();

      var totalSec = endSec - startSec;
      await new Promise(function(resolve) {
        var t = setInterval(function() {
          var elapsed = video.currentTime - startSec;
          var pct = Math.min(100, Math.max(0, (elapsed / totalSec) * 100));
          if (onProgress) {
            var remaining = Math.max(0, totalSec - elapsed);
            onProgress('מקליט וידאו: ' + pct.toFixed(0) + '% · נשארו ~' + remaining.toFixed(0) + ' שנ׳');
          }
          if (video.currentTime >= endSec || video.ended) {
            clearInterval(t);
            try { video.pause(); } catch (_) {}
            try { recorder.stop(); } catch (_) {}
            resolve();
          }
        }, 200);
      });

      await recPromise;
      var ext = mimeType.indexOf('mp4') >= 0 ? '.mp4' : '.webm';
      var blob = new Blob(chunks, { type: mimeType.split(';')[0] });
      cleanup();
      return { blob: blob, ext: ext, mimeType: mimeType, sizeMB: (blob.size / 1024 / 1024).toFixed(1) };
    } catch (e) {
      cleanup();
      throw e;
    }
  }

  // Filter Whisper chunks by user-selected time ranges and group into sections.
  // Returns array of { name, chunks } — each section becomes a heading in DOCX.
  // If no ranges → single full-transcript section.
  function _filterChunksByRanges(chunks, ranges) {
    if (!ranges || !ranges.length) {
      return [{ name: null, chunks: chunks }];
    }
    return ranges.map(function(r){
      var s = r[0], e = r[1];
      var label = _formatHMS(s).replace(/^00:/, '') + '–' + _formatHMS(e).replace(/^00:/, '');
      var inRange = (chunks || []).filter(function(c){
        var cs = c.timestamp[0], ce = c.timestamp[1] != null ? c.timestamp[1] : cs;
        return ce >= s && cs <= e;
      });
      return { name: label, chunks: inRange };
    });
  }

  // Build a multi-section DOCX HTML body. Each section gets an H2 + paragraphs.
  function _buildMultiSectionDocHtml(baseName, sourceLine, sections) {
    var dateStr = new Date().toLocaleDateString('he-IL');
    var parts = [
      "<html xmlns:o='urn:schemas-microsoft-com:office:office'",
      " xmlns:w='urn:schemas-microsoft-com:office:word'",
      " xmlns='http://www.w3.org/TR/REC-html40'>",
      "<head><meta charset='utf-8'><title>" + _esc(baseName) + "</title>",
      "<style>body{font-family:Arial,sans-serif;padding:36px;max-width:820px;direction:rtl;}",
      "p{unicode-bidi:plaintext;}h2{color:#2d6f9c;}</style></head>",
      "<body dir='rtl'>",
      "<h1 style='font-size:22px;margin-bottom:4px;direction:rtl;text-align:right;'>" + _esc(baseName) + "</h1>",
      "<p style='font-size:11px;color:#999;margin:0 0 28px;direction:ltr;text-align:left;'>" + _esc(sourceLine) + " · " + dateStr + "</p>",
      "<hr style='border:none;border-top:1px solid #e0e0e0;margin-bottom:24px;'>"
    ];
    sections.forEach(function(sec){
      if (sec.name) {
        parts.push("<h2 style='font-size:18px;margin:24px 0 10px;direction:rtl;text-align:right;'>⏱ " + _esc(sec.name) + "</h2>");
      }
      parts.push(_buildTimestampedHtml(sec.chunks, 0, null, null));
    });
    parts.push("</body></html>");
    return parts.join('');
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

  // Show the done-toast. Accepts either (dlName, blob) or (dlName, blobUrl) for
  // backward compat — if blobOrUrl is a Blob, the save button uses the File
  // System Access API picker (so the user picks where to save).
  function _vtShowDone(dlName, blobOrUrl) {
    var pickerSupported = typeof window.showSaveFilePicker === 'function';
    var btnLabel = pickerSupported ? '💾 שמור בתיקייה שלי…' : '⬇ הורד קובץ Word';
    _vtToastHtml(`
      <div style="background:linear-gradient(135deg,#5ba3d0,#2d6f9c);padding:11px 16px;color:#fff;display:flex;align-items:center;gap:10px;">
        <span style="font-size:20px;">✅</span>
        <strong style="font-size:13px;">התמלול הושלם!</strong>
      </div>
      <div style="padding:14px 16px;">
        <div style="font-size:12px;color:#666;margin-bottom:12px;">${_esc(dlName)}</div>
        <button id="vt-dl-btn" style="width:100%;padding:10px;background:linear-gradient(135deg,#cfe4f7,#5ba3d0);border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;color:#fff;margin-bottom:8px;">${btnLabel}</button>
        <button id="vt-close-btn" style="width:100%;padding:7px;background:#f5f5f5;border:1px solid #e0e0e0;border-radius:8px;font-size:12px;cursor:pointer;color:#888;">סגור</button>
      </div>`);
    _vtToast.querySelector('#vt-dl-btn').onclick = async function() {
      var blob = (blobOrUrl instanceof Blob) ? blobOrUrl : null;
      if (blob) {
        var res = await _saveDocViaPicker(blob, dlName);
        if (res.method === 'cancelled') return;       // user changed their mind, keep toast open
        _vtToast.style.display = 'none';
      } else {
        // Legacy URL path
        var a = document.createElement('a'); a.href = blobOrUrl; a.download = dlName; a.click();
        setTimeout(function() { try { URL.revokeObjectURL(blobOrUrl); } catch(_){} _vtToast.style.display = 'none'; }, 3000);
      }
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
    // Hard-coded Worker URL — transparent to the user, no UI field.
    const WORKER_URL = 'https://broad-hall-729c.gagula22.workers.dev';

    const statusEl = App.el('p', { style: { margin: '10px 0 0', fontSize: '13px', color: 'var(--ink-mute)' } });
    const barTrack = App.el('div', { style: { marginTop: '10px', height: '5px', background: '#e8e8e8', borderRadius: '3px', overflow: 'hidden' } });
    const barFill  = App.el('div', { style: { height: '5px', background: 'linear-gradient(90deg,#cfe4f7,#5ba3d0)', width: '0', transition: 'width 400ms ease' } });
    barTrack.appendChild(barFill);

    const bgBadge = App.el('div', {
      style: { display: 'none', marginTop: '12px', padding: '10px 14px',
               background: '#f0f6fb', border: '1px solid #a0c8e8',
               borderRadius: 'var(--r-sm)', fontSize: '13px', color: '#2d6f9c', lineHeight: '1.5' }
    }, '🎙 התמלול רץ ברקע · תוכל לנווט בחופשיות · תקבל הודעה כשיסיים');

    // ── Advanced settings panel (collapsible) ─────────────────────────────
    // ── Source selector: cloud (Cloudflare Worker) vs local (browser Whisper)
    const sourceSel = document.createElement('select');
    sourceSel.style.cssText = 'padding:6px 10px;border:1px solid #d0c080;border-radius:8px;font-size:13px;background:#fffef5;direction:rtl;cursor:pointer;flex:1;';
    [
      { v: 'cloud', l: '🚀 Cloudflare Workers AI · large-v3-turbo · מהיר · אפס עומס' },
      { v: 'local', l: '💻 דפדפן (offline) · small/medium · רץ על המחשב' }
    ].forEach(function(o){
      var opt = document.createElement('option');
      opt.value = o.v; opt.textContent = o.l;
      sourceSel.appendChild(opt);
    });
    sourceSel.value = localStorage.getItem('vt_source') || 'cloud';
    sourceSel.addEventListener('change', function(){
      try { localStorage.setItem('vt_source', sourceSel.value); } catch(_){}
      _toggleSourceFields();
    });

    const modelSel = document.createElement('select');
    modelSel.style.cssText = 'padding:6px 10px;border:1px solid #d0c080;border-radius:8px;font-size:13px;background:#fffef5;direction:rtl;cursor:pointer;';
    [
      { v: 'Xenova/whisper-small',  l: 'small (~150MB · מהיר · איכות סבירה)' },
      { v: 'Xenova/whisper-medium', l: 'medium (~750MB · איטי · איכות גבוהה)' }
    ].forEach(function(o) {
      var opt = document.createElement('option');
      opt.value = o.v; opt.textContent = o.l;
      modelSel.appendChild(opt);
    });

    const startInput = document.createElement('input');
    startInput.type = 'text';
    startInput.placeholder = 'MM:SS / HH:MM:SS';
    startInput.style.cssText = 'padding:6px 10px;border:1px solid #d0c080;border-radius:8px;font-size:13px;background:#fffef5;direction:ltr;text-align:center;width:130px;';

    const endInput = document.createElement('input');
    endInput.type = 'text';
    endInput.placeholder = 'MM:SS / HH:MM:SS';
    endInput.style.cssText = startInput.style.cssText;

    const advPanel = document.createElement('details');
    advPanel.style.cssText = 'margin-top:12px;border:1px solid var(--line);border-radius:var(--r-sm);background:#fafafa;';
    advPanel.innerHTML =
      '<summary style="padding:10px 14px;cursor:pointer;font-size:13px;font-weight:600;color:#555;user-select:none;">⚙️ הגדרות מתקדמות</summary>' +
      '<div id="vt-adv-body" style="padding:12px 14px 14px;border-top:1px solid var(--line);"></div>';
    const advBody = advPanel.querySelector('#vt-adv-body');

    function _advRow(labelText, control) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:10px;font-size:13px;';
      var lbl = document.createElement('span');
      lbl.style.cssText = 'min-width:90px;color:#555;font-weight:600;';
      lbl.textContent = labelText;
      row.appendChild(lbl); row.appendChild(control);
      return row;
    }

    var sourceRow = _advRow('מקור עיבוד', sourceSel);
    var modelRow  = _advRow('מודל',        modelSel);
    var startRow  = _advRow('זמן התחלה',   startInput);
    var endRow    = _advRow('זמן סיום',    endInput);

    advBody.appendChild(sourceRow);
    advBody.appendChild(modelRow);
    advBody.appendChild(startRow);
    advBody.appendChild(endRow);

    var hint = document.createElement('p');
    hint.style.cssText = 'margin:6px 0 0;font-size:12px;color:#888;line-height:1.5;';
    hint.innerHTML = 'השאר ריק לתמלול הקובץ המלא · דוגמאות: <code style="background:#eee;padding:1px 5px;border-radius:3px;">10:00</code> <code style="background:#eee;padding:1px 5px;border-radius:3px;">1:23:45</code> <code style="background:#eee;padding:1px 5px;border-radius:3px;">90s</code> <code style="background:#eee;padding:1px 5px;border-radius:3px;">1h2m</code>';
    advBody.appendChild(hint);

    function _toggleSourceFields() {
      var isCloud = sourceSel.value === 'cloud';
      modelRow.style.display = isCloud ? 'none' : '';
    }
    _toggleSourceFields();

    // Read & validate advanced settings. Returns full settings object
    // or throws an Error with a Hebrew message on bad input.
    function _readAdvanced() {
      var source   = sourceSel.value || 'cloud';
      var model    = modelSel.value || 'Xenova/whisper-small';
      var rawStart = startInput.value.trim();
      var rawEnd   = endInput.value.trim();
      var startSec = rawStart ? _parseTimeInput(rawStart) : null;
      var endSec   = rawEnd   ? _parseTimeInput(rawEnd)   : null;
      if (Number.isNaN(startSec)) throw new Error('זמן התחלה לא תקין: ' + rawStart);
      if (Number.isNaN(endSec))   throw new Error('זמן סיום לא תקין: ' + rawEnd);
      if (startSec != null && endSec != null && startSec >= endSec) {
        throw new Error('זמן הסיום חייב להיות אחרי זמן ההתחלה');
      }
      var suffix = '';
      if (startSec != null || endSec != null) {
        var a = startSec != null ? _formatHMS(startSec).replace(/^00:/, '') : '0:00';
        var b = endSec   != null ? _formatHMS(endSec).replace(/^00:/, '')   : 'סוף';
        suffix = ' (' + a + '–' + b + ')';
      }
      return {
        source: source,
        workerUrl: WORKER_URL,
        model: model,
        startSec: startSec,
        endSec: endSec,
        suffix: suffix
      };
    }

    // ── Audio file processing ─────────────────────────────────────────────
    async function transcribeFile(file) {
      if (!file || _vtRunning) return;
      if (file.size > MAX_FILE) { statusEl.textContent = 'קובץ גדול מדי — מקסימום 2 GB'; statusEl.style.color = '#c00'; return; }

      // Read advanced settings up-front so validation errors fail fast
      let adv;
      try { adv = _readAdvanced(); }
      catch (err) {
        statusEl.textContent = err.message;
        statusEl.style.color = '#c00';
        _vtShowError(err.message);
        return;
      }

      _vtRunning = true;
      barFill.style.width    = '3%';
      statusEl.style.color   = 'var(--ink-mute)';
      statusEl.textContent   = 'מפענח קובץ אודיו…';
      bgBadge.style.display  = 'block';
      _vtShowProgress(3, 'מפענח קובץ אודיו…');

      // Run everything async — non-blocking even after navigation
      (async function() {
        try {
          var text, chunks, offsetSec, docTitleSrc;
          var detectedLang = null;
          var translation = null;

          if (adv.source === 'cloud') {
            const FAST_LIMIT_BYTES = 95 * 1024 * 1024;
            const noTrim = (adv.startSec == null && adv.endSec == null);
            const ext = (file.name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
            const isCompressedAudio = ['.mp3', '.m4a', '.wav', '.aac', '.ogg', '.flac'].indexOf(ext) >= 0;
            const sizeMB = (file.size / 1024 / 1024).toFixed(1);

            // (Pre-flight removed — it was blocking on transient Cloudflare
            // failures even when the real chunked transcription would have
            // succeeded via the retry mechanism.)

            // ── MP3 BYTE-SLICE PATH: works for any MP3 size, with or without
            // trim. Avoids decoding entirely (which Chrome fails on long MP3s),
            // validates trim against actual duration, and produces correct
            // sub-files at frame boundaries for upload.
            let mp3meta = null;
            if (ext === '.mp3') {
              statusEl.textContent = 'בודק metadata של MP3 (' + sizeMB + ' MB)…';
              _vtShowProgress(8, 'בודק metadata של MP3…');
              try { mp3meta = await _readMp3Metadata(file); } catch (_) {}
            }

            if (mp3meta) {
              const startSec = adv.startSec || 0;
              const endSec = (adv.endSec != null) ? adv.endSec : mp3meta.durationSec;
              if (endSec > mp3meta.durationSec + 0.5) {
                throw new Error('זמן סיום ' + _formatHMS(endSec) + ' חורג ממשך הקובץ (' + _formatHMS(mp3meta.durationSec) + ')');
              }
              const rangeMin = ((endSec - startSec) / 60).toFixed(1);
              statusEl.textContent = 'מתמלל ' + rangeMin + ' דקות MP3 בענן (חיתוך ישיר)…';
              _vtShowProgress(15, 'מתמלל ' + rangeMin + ' דקות MP3 בענן…');

              const cloudResult = await _transcribeMp3ByteSliced(
                adv.workerUrl, mp3meta, startSec, endSec, 'auto',
                function(msg){
                  if (document.body.contains(statusEl)) statusEl.textContent = msg;
                  _vtShowProgress(60, msg);
                }
              );
              text   = cloudResult.text;
              chunks = cloudResult.chunks;
              detectedLang = cloudResult.detectedLanguage || null;
              offsetSec = 0;  // already absolute (helper added startSec to each chunk)
              docTitleSrc = 'תמלול · Cloudflare Workers AI · whisper-large-v3-turbo';
            } else if (file.size <= FAST_LIMIT_BYTES && noTrim && isCompressedAudio) {
              // ── FAST PATH for non-MP3 compressed audio ≤95MB
              statusEl.textContent = 'מעלה ' + sizeMB + ' MB ל-Cloudflare (ללא פענוח)…';
              barFill.style.width  = '15%';
              _vtShowProgress(15, 'מעלה ' + sizeMB + ' MB ל-Cloudflare (מסלול מהיר — ללא פענוח)…');
              const ab = await file.arrayBuffer();
              const cloudResult = await _transcribeViaWorker(adv.workerUrl, ab, 'auto', function(msg){
                if (document.body.contains(statusEl)) statusEl.textContent = msg;
                _vtShowProgress(60, msg);
              });
              text   = cloudResult.text;
              chunks = cloudResult.chunks;
              detectedLang = cloudResult.detectedLanguage || null;
              offsetSec = 0;
              docTitleSrc = 'תמלול · Cloudflare Workers AI · whisper-large-v3-turbo';
            } else {
            // ── CHUNKED PATH: decode → downsample → ~40-min WAV chunks ─────
            // Used for non-MP3 large files, video files, or partial-range trims
            // on non-MP3 sources.
            statusEl.textContent = 'מפענח קובץ ' + sizeMB + ' MB בדפדפן…';
            barFill.style.width  = '8%';
            _vtShowProgress(8, 'מפענח קובץ אודיו בדפדפן…');
            const decoded = await _decodeAnyFileToPcm(file, function(msg){
              if (document.body.contains(statusEl)) statusEl.textContent = msg;
              _vtShowProgress(10, msg);
            });
            let pcm = decoded.pcm;

            // Apply user's trim range (if set)
            if (adv.startSec != null || adv.endSec != null) {
              pcm = _slicePcmSec(pcm, adv.startSec, adv.endSec, decoded.sampleRate);
            }
            offsetSec = adv.startSec || 0;

            const totalMin = (pcm.length / decoded.sampleRate / 60).toFixed(1);
            statusEl.textContent = 'מתמלל בענן (' + totalMin + ' דקות אודיו)…';
            _vtShowProgress(20, 'מתמלל ' + totalMin + ' דקות בענן…');

            const cloudResult = await _transcribeViaWorkerChunked(
              adv.workerUrl, pcm, decoded.sampleRate, 'auto',
              function(msg){
                if (document.body.contains(statusEl)) statusEl.textContent = msg;
                _vtShowProgress(60, msg);
              }
            );
            text   = cloudResult.text;
            chunks = cloudResult.chunks;
            detectedLang = cloudResult.detectedLanguage || null;
            // Apply offset to chunks if user trimmed (timestamps stay absolute
            // from start of original file, like the local path)
            if (offsetSec && chunks) {
              chunks = chunks.map(function(c){
                return { timestamp: [c.timestamp[0] + offsetSec, c.timestamp[1] + offsetSec], text: c.text };
              });
            }
            docTitleSrc = 'תמלול · Cloudflare Workers AI · whisper-large-v3-turbo';
            }  // end of CHUNKED PATH

            // ── AUTO-TRANSLATE TO HEBREW if source language detected and != 'he' ──
            if (detectedLang && detectedLang !== 'he' && detectedLang !== 'iw' && text && text.trim().length > 0) {
              statusEl.textContent = '🌍 מזוהה: ' + detectedLang + ' · מתרגם לעברית באמצעות Llama 3…';
              _vtShowProgress(85, '🌍 מזוהה: ' + detectedLang + ' · מתרגם לעברית…');
              try {
                const translateResult = await _translateViaWorker(adv.workerUrl, text, 'he', function(msg){
                  if (document.body.contains(statusEl)) statusEl.textContent = '🌍 ' + msg;
                  _vtShowProgress(90, '🌍 ' + msg);
                });
                translation = {
                  text: translateResult.translation,
                  sourceLang: detectedLang,
                  targetLang: 'he',
                  targetName: translateResult.targetName || 'Hebrew'
                };
                docTitleSrc += ' · תרגום לעברית: Llama 3';
              } catch (translateErr) {
                console.warn('[transcribe] translation failed:', translateErr);
                // Don't abort — just skip translation and proceed with original transcript
                statusEl.textContent = '⚠️ תרגום נכשל: ' + translateErr.message + ' · ממשיך בלי תרגום';
              }
            }
          } else {
            // ── Local path: decode in browser, run Whisper in Web Worker ─────
            statusEl.textContent = 'מפענח קובץ אודיו…';
            _vtShowProgress(8, 'מפענח קובץ אודיו…');
            const decodedLocal = await _decodeAnyFileToPcm(file, function(msg){
              if (document.body.contains(statusEl)) statusEl.textContent = msg;
              _vtShowProgress(10, msg);
            });
            let audio = decodedLocal.pcm;

            audio = _trimAudio(audio, adv.startSec, adv.endSec);
            const durationMin = Math.round(audio.length / 16000 / 60);
            offsetSec = adv.startSec || 0;

            const isMedium = adv.model.indexOf('medium') >= 0;
            _wwProgCb = function(p) {
              if (p.status === 'progress') {
                const pct = Math.round(p.progress || 0);
                const sizeNote = isMedium ? '~750MB' : '~150MB';
                const msg = `מוריד מודל Whisper (${sizeNote})… ${pct}% — חד-פעמי`;
                if (document.body.contains(statusEl)) { barFill.style.width = (3 + pct * 0.15) + '%'; statusEl.textContent = msg; }
                _vtShowProgress(3 + pct * 0.15, msg);
              }
            };
            const initMsg = 'מאתחל מודל Whisper AI…';
            if (document.body.contains(statusEl)) statusEl.textContent = initMsg;
            _vtShowProgress(18, initMsg);
            await _ensureWhisperWorker(adv.model);

            const transMsg = `מתמלל ${durationMin} דקות אודיו ברקע…`;
            if (document.body.contains(statusEl)) { barFill.style.width = '22%'; statusEl.textContent = transMsg; }
            _vtShowProgress(22, transMsg);

            const localResult = await _whisperTranscribe(audio);
            text   = localResult.text;
            chunks = localResult.chunks;
            docTitleSrc = 'תמלול עברית · Whisper AI ' + (isMedium ? '(medium)' : '(small)');
          }

          // ── Build Word .doc (shared between cloud + local paths) ──────────
          if (document.body.contains(statusEl)) _vtShowProgress(97, 'מכין קובץ Word…');
          const baseName  = file.name.replace(/\.[^.]+$/, '') + adv.suffix;
          const dateStr   = new Date().toLocaleDateString('he-IL');
          const paragraphs = _buildTimestampedHtml(chunks, offsetSec, null, text);

          // Build optional translation block (auto-translate when source != Hebrew)
          let translationBlock = '';
          if (translation && translation.text) {
            const langLabel = ({ en: 'אנגלית', ar: 'ערבית', ru: 'רוסית', fr: 'צרפתית', es: 'ספרדית', de: 'גרמנית' })[detectedLang] || detectedLang;
            const transParas = translation.text.split(/\n+/).filter(function(p){ return p.trim(); }).map(function(p){
              return '<p style="direction:rtl;text-align:right;font-family:Arial,sans-serif;font-size:14px;line-height:1.9;margin:0 0 12px;unicode-bidi:plaintext;">' + _esc(p.trim()) + '</p>';
            }).join('');
            translationBlock =
              '<hr style="border:none;border-top:2px solid #2d7a2d;margin:36px 0 18px;">' +
              '<h2 style="font-size:18px;margin:0 0 4px;direction:rtl;text-align:right;color:#2d7a2d;">🌍 תרגום לעברית</h2>' +
              '<p style="font-size:11px;color:#999;margin:0 0 18px;direction:rtl;text-align:right;">תורגם אוטומטית מ' + _esc(langLabel) + ' באמצעות Llama 3 על Cloudflare Workers AI</p>' +
              transParas;
          }

          // Section header for transcript when translation exists (so the user
          // sees clearly that the first section is the source-language transcript)
          let transcriptHeader = '';
          if (translation && translation.text && detectedLang && detectedLang !== 'he') {
            const sourceLabel = ({ en: 'אנגלית', ar: 'ערבית', ru: 'רוסית', fr: 'צרפתית', es: 'ספרדית', de: 'גרמנית' })[detectedLang] || detectedLang;
            transcriptHeader = '<h2 style="font-size:18px;margin:0 0 4px;direction:rtl;text-align:right;color:#2d6f9c;">🎙 תמלול במקור (' + _esc(sourceLabel) + ')</h2>';
          }

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
            `${_esc(docTitleSrc)} · ${dateStr}</p>`,
            `<hr style="border:none;border-top:1px solid #e0e0e0;margin-bottom:24px;">`,
            transcriptHeader,
            paragraphs,
            translationBlock,
            `</body></html>`
          ].join('');

          const blob    = new Blob(['﻿', docHtml], { type: 'application/msword' });
          const dlName  = baseName + '_תמלול.doc';

          if (document.body.contains(statusEl)) {
            barFill.style.width    = '100%';
            bgBadge.style.display  = 'none';
            statusEl.style.color   = 'var(--sky-deep,#2d6f9c)';
            const wordCount = Math.round(text.split(/\s+/).length);
            const transNote = translation && translation.text
              ? ' + תרגום לעברית (' + (detectedLang || '?') + '→he)'
              : '';
            statusEl.textContent   = `✓ תמלול הושלם · ${wordCount} מילים${transNote} · ראה הודעה בפינה`;
          }
          _vtShowDone(dlName, blob);

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

    // ── YouTube → external download launcher ──────────────────────────────
    // YouTube actively blocks audio extraction from datacenter IPs (verified
    // 2026: TVHTML5, IOS, ANDROID InnerTube clients all return 400/lockdown
    // from Cloudflare). Solution: paste URL → click → opens a downloader
    // (cobalt/savefrom/yt1s) → user drags MP3 → cloud transcribes + picker.
    const ytInput = document.createElement('input');
    ytInput.type = 'text';
    ytInput.placeholder = 'הדבק קישור YouTube…';
    ytInput.style.cssText = 'flex:1;padding:8px 12px;border:1px solid #d0c080;border-radius:8px;font-size:13px;outline:none;background:#fffef5;direction:ltr;min-width:0;';

    const ytStatusEl = App.el('div', {
      style: { fontSize: '12px', color: 'var(--ink-mute)', marginTop: '10px', lineHeight: '1.55', minHeight: '16px' }
    }, '');

    function _ytStatus(msg, color) {
      ytStatusEl.textContent = msg;
      ytStatusEl.style.color = color || 'var(--ink-mute)';
    }

    // External downloader services. `copyFirst:true` copies the URL to the
    // clipboard before opening (for sites that don't accept URL prefill).
    var YT_SERVICES = [
      { name: '⭐ vidssave',  primary: true, copyFirst: true,
        build: function(){ return 'https://vidssave.com/youtube-video-downloader-3cx'; } },
      { name: 'cobalt.tools', build: function(u){ return 'https://cobalt.tools/#' + encodeURIComponent(u); } },
      { name: 'savefrom',     build: function(u){ return 'https://en.savefrom.net/1-youtube-video-downloader-336/?url=' + encodeURIComponent(u); } },
      { name: 'yt1s',         build: function(u){ return 'https://yt1s.com/youtube-to-mp3?q=' + encodeURIComponent(u); } },
      { name: 'y2mate',       build: function(u, id){ return 'https://www.y2mate.com/youtube-mp3/' + id; } },
      { name: 'ssyoutube',    build: function(u){ return u.replace('youtube.com', 'ssyoutube.com').replace('youtu.be/', 'ssyoutu.be/'); } }
    ];

    async function _openYtService(svc) {
      var url = ytInput.value.trim();
      if (!url) { ytInput.focus(); _ytStatus('❌ הדבק קישור YouTube ואז לחץ על שירות', '#c00'); return; }
      var vidId = _extractYouTubeId(url);
      if (!vidId) { _ytStatus('❌ קישור YouTube לא תקין', '#c00'); return; }

      // For services without URL prefill, copy the YouTube URL to clipboard
      // first so the user just hits Ctrl+V on the destination page.
      var copied = false;
      if (svc.copyFirst && navigator.clipboard && navigator.clipboard.writeText) {
        try { await navigator.clipboard.writeText(url); copied = true; } catch (_) {}
      }

      var dest = svc.build(url, vidId);
      window.open(dest, '_blank', 'noopener,noreferrer');

      var clipboardNote = copied ? ' · הקישור הועתק ל-clipboard, ב-' + svc.name.replace(/^[^\w]+/, '') + ' הקלד Ctrl+V' : '';
      _ytStatus('✓ נפתח ' + svc.name + ' בכרטיסייה חדשה' + clipboardNote + ' · הורד MP3 → גרור לתיבה למעלה', '#2d7a2d');
    }

    var ytPrimaryRow = document.createElement('div');
    ytPrimaryRow.style.cssText = 'display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;';
    var ytFallbackLabel = document.createElement('div');
    ytFallbackLabel.style.cssText = 'font-size:11px;color:#999;margin-top:14px;margin-bottom:4px;';
    ytFallbackLabel.textContent = 'אם vidssave חסום — נסה אחד מאלה:';
    var ytFallbackRow = document.createElement('div');
    ytFallbackRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
    YT_SERVICES.forEach(function(svc) {
      var b = document.createElement('button');
      b.textContent = svc.name;
      if (svc.primary) {
        b.style.cssText = 'padding:10px 22px;background:#f5c842;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;color:#3b3a3a;transition:background 120ms;flex:1;min-width:200px;';
        b.onmouseover = function(){ b.style.background = '#f0b800'; };
        b.onmouseout  = function(){ b.style.background = '#f5c842'; };
        ytPrimaryRow.appendChild(b);
      } else {
        b.style.cssText = 'padding:6px 12px;background:#fff7d6;border:1px solid #d0c080;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;color:#5a4a00;transition:background 120ms;';
        b.onmouseover = function(){ b.style.background = '#f5c842'; };
        b.onmouseout  = function(){ b.style.background = '#fff7d6'; };
        ytFallbackRow.appendChild(b);
      }
      b.onclick = function(){ _openYtService(svc); };
    });
    ytInput.addEventListener('keydown', function(e){
      if (e.key === 'Enter') _openYtService(YT_SERVICES[0]);
    });

    // Helper for step section headers — gives each step a numbered badge
    function _stepHeader(num, title, color) {
      return App.el('div', {
        style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }
      }, [
        App.el('span', {
          style: {
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '26px', height: '26px', borderRadius: '50%',
            background: color, color: '#fff', fontWeight: '700', fontSize: '13px',
            flexShrink: '0'
          }
        }, String(num)),
        App.el('div', {
          style: { fontWeight: '700', fontSize: '14px', color: '#3b3a3a' }
        }, title)
      ]);
    }
    function _stepHowto(lines) {
      var ol = document.createElement('ol');
      ol.style.cssText = 'margin:6px 0 12px 26px;padding:0;font-size:12px;color:#666;line-height:1.85;';
      lines.forEach(function(line){
        var li = document.createElement('li');
        li.innerHTML = line;
        ol.appendChild(li);
      });
      return ol;
    }

    const ytSection = App.el('div', {
      style: { marginTop: '20px', paddingTop: '18px', borderTop: '1px solid var(--line)' }
    }, [
      _stepHeader(1, 'להוריד את הוידאו מ-YouTube ולשמור במחשב', '#5ba3d0'),
      _stepHowto([
        'הדבק את כתובת הוידאו מ-YouTube בשדה למטה',
        'לחץ על <b>⭐ vidssave</b> · הקישור מועתק ל-clipboard ואתר הורדה ייפתח בכרטיסייה חדשה',
        'באתר ההורדה: לחץ בשדה והקלד <b>Ctrl+V</b> · בחר פורמט (MP3 הכי מהיר; MP4 גם נתמך) · לחץ <b>Download</b>',
        'הקובץ יורד לתיקיית ההורדות במחשב — סיימת את שלב 1'
      ]),
      ytInput,
      ytPrimaryRow,
      ytFallbackLabel,
      ytFallbackRow,
      ytStatusEl
    ]);

    // ── Cut tool: split a file into clips by time ranges, save each ──────
    let _cutFile = null;
    let _cutDecoded = null;
    let _cutMp3Meta = null;   // when set, byte-slice path is used (MP3 fast)
    let _cutRunning = false;

    const cutFileLabel = document.createElement('div');
    cutFileLabel.style.cssText = 'font-size:12px;color:#888;margin-top:8px;min-height:16px;';

    const cutStatusEl = document.createElement('div');
    cutStatusEl.style.cssText = 'font-size:12px;color:var(--ink-mute);margin-top:8px;line-height:1.55;min-height:16px;';

    function _cutStatus(msg, color) {
      cutStatusEl.textContent = msg;
      cutStatusEl.style.color = color || 'var(--ink-mute)';
    }

    async function _cutLoadFile(file) {
      if (!file || _cutRunning) return;
      _cutFile = file;
      _cutDecoded = null;
      _cutMp3Meta = null;
      cutFileLabel.textContent = '📁 ' + file.name + ' · ' + (file.size/1024/1024).toFixed(1) + ' MB · קורא…';
      _cutStatus('⏳ קורא קובץ…');
      try {
        // Fast path: MP3 — byte-slice without decoding. Even VBR works because
        // we read Xing/Info header for duration.
        let mp3 = null;
        let mp3Err = null;
        try {
          mp3 = await _readMp3Metadata(file);
        } catch (e) {
          mp3Err = e;
          console.warn('[cut] _readMp3Metadata threw:', e);
        }
        console.log('[cut] MP3 metadata for', file.name, '=', mp3, 'err=', mp3Err);

        if (mp3) {
          _cutMp3Meta = mp3;
          _cutDecoded = { durationSec: mp3.durationSec };
          const min = (mp3.durationSec / 60).toFixed(1);
          const kbps = Math.round(mp3.bitrate / 1000);
          const vbrTag = mp3.isVbr ? ' VBR' : ' CBR';
          cutFileLabel.textContent = '📁 ' + file.name + ' · ' + (file.size/1024/1024).toFixed(1) +
            ' MB · משך: ' + min + ' דקות · MP3 ' + kbps + 'kbps' + vbrTag + ' · חיתוך ישיר';
          const vbrNote = mp3.isVbr ? ' (VBR — קצוות עשויים לסטות בשנייה־שתיים)' : '';
          _cutStatus('✓ מוכן (מסלול MP3 מהיר v2)' + vbrNote + ' — הקליפים יישמרו כ-MP3', '#2d7a2d');
          return;
        }

        // MP3 parsing failed — show why before falling back to slow decode
        const ext = ((file.name || '').match(/\.[^.]+$/) || [''])[0].toLowerCase();
        if (ext === '.mp3') {
          _cutStatus('⚠️ הקובץ הוא MP3 אבל לא הצלחתי לפענח header — נופל למסלול דקודר איטי. בדוק Console (F12)', '#b85c00');
        } else {
          _cutStatus('⏳ פורמט לא-MP3 (' + ext + ') — עובר לדקודר…');
        }
        _cutDecoded = await _decodeAnyFileToPcm(file, function(msg){ _cutStatus('⏳ ' + msg); });
        const min = (_cutDecoded.durationSec / 60).toFixed(1);
        cutFileLabel.textContent = '📁 ' + file.name + ' · ' + (file.size/1024/1024).toFixed(1) + ' MB · משך: ' + min + ' דקות (דקודר)';
        _cutStatus('✓ מוכן (מסלול דקודר) — הקליפים יישמרו כ-WAV', '#2d7a2d');
      } catch (e) {
        _cutStatus('❌ לא הצלחתי לקרוא: ' + e.message, '#c00');
        cutFileLabel.textContent = '';
      }
    }

    const cutFileInput = document.createElement('input');
    cutFileInput.type = 'file';
    cutFileInput.accept = '.mp3,.mp4,.wav,.m4a,.webm,.ogg,.aac,.flac';
    cutFileInput.style.display = 'none';
    cutFileInput.addEventListener('change', function(){ _cutLoadFile(cutFileInput.files[0]); cutFileInput.value = ''; });

    const cutZone = App.el('div', {
      style: { border: '2px dashed var(--line)', borderRadius: 'var(--r-md)',
               padding: '20px', textAlign: 'center', cursor: 'pointer',
               transition: 'all 180ms', background: 'var(--cream)',
               marginTop: '10px' },
      onClick: function() { if (!_cutRunning) cutFileInput.click(); }
    }, [
      App.el('div', { style: { fontSize: '28px', marginBottom: '4px' } }, '✂️'),
      App.el('div', { style: { fontWeight: 600, fontSize: '13px', marginBottom: '2px' } },
        'גרור קובץ שמע בלבד לחיתוך כאן'),
      App.el('div', { style: { fontSize: '11px', color: 'var(--ink-mute)' } },
        'MP3 / MP4 / WAV / M4A / WebM · הקליפים יישמרו כ-WAV במקום שתבחר')
    ]);
    cutZone.addEventListener('dragover',  function(e) { e.preventDefault(); cutZone.style.borderColor = 'var(--lavender-deep,#9b8bb8)'; cutZone.style.background = 'var(--lavender,#e6ddf4)'; });
    cutZone.addEventListener('dragleave', function()  { cutZone.style.borderColor = 'var(--line)'; cutZone.style.background = 'var(--cream)'; });
    cutZone.addEventListener('drop', function(e) {
      e.preventDefault(); cutZone.style.borderColor = 'var(--line)'; cutZone.style.background = 'var(--cream)';
      _cutLoadFile(e.dataTransfer.files[0]);
    });

    // Cut ranges UI (independent from transcription's start/end inputs)
    const cutRangesContainer = document.createElement('div');
    cutRangesContainer.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:10px;';

    function _addCutRangeRow(start, end) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;align-items:center;';
      const startBox = document.createElement('input');
      startBox.type = 'text';
      startBox.placeholder = 'התחלה (1:30)';
      startBox.value = start || '';
      startBox.style.cssText = 'flex:1;padding:6px 10px;border:1px solid #d0c080;border-radius:8px;font-size:13px;background:#fffef5;direction:ltr;text-align:center;';
      const endBox = document.createElement('input');
      endBox.type = 'text';
      endBox.placeholder = 'סיום (3:00)';
      endBox.value = end || '';
      endBox.style.cssText = startBox.style.cssText;
      const rmBtn = document.createElement('button');
      rmBtn.textContent = '×';
      rmBtn.title = 'הסר קטע';
      rmBtn.style.cssText = 'width:32px;height:32px;background:#fff7d6;border:1px solid #d0c080;border-radius:8px;font-size:16px;cursor:pointer;color:#888;flex-shrink:0;';
      rmBtn.onclick = function(){ row.remove(); };
      row.appendChild(startBox);
      row.appendChild(endBox);
      row.appendChild(rmBtn);
      row.__startBox = startBox;
      row.__endBox = endBox;
      cutRangesContainer.appendChild(row);
    }
    _addCutRangeRow();  // start with one empty row

    const cutAddBtn = document.createElement('button');
    cutAddBtn.textContent = '＋ הוסף קטע';
    cutAddBtn.style.cssText = 'padding:6px 14px;background:#fff;border:1px dashed #d0c080;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;color:#5a4a00;margin-top:6px;align-self:flex-start;';
    cutAddBtn.onclick = function(){ _addCutRangeRow(); };

    const cutGoBtn = document.createElement('button');
    cutGoBtn.textContent = '✂️ חתוך ושמור קליפים';
    cutGoBtn.style.cssText = 'padding:10px 22px;background:#e6ddf4;border:1px solid #9b8bb8;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;color:#3b3a3a;margin-top:12px;align-self:flex-start;';

    async function _cutGo() {
      if (_cutRunning) return;
      if (!_cutDecoded) { _cutStatus('❌ גרור קובץ קודם', '#c00'); return; }

      const ranges = [];
      const rows = cutRangesContainer.children;
      for (let i = 0; i < rows.length; i++) {
        const rs = rows[i].__startBox.value.trim();
        const re = rows[i].__endBox.value.trim();
        if (!rs && !re) continue;
        const s = _parseTimeInput(rs);
        const e = _parseTimeInput(re);
        if (Number.isNaN(s) || s == null) { _cutStatus('❌ זמן התחלה לא תקין: ' + rs, '#c00'); return; }
        if (Number.isNaN(e) || e == null) { _cutStatus('❌ זמן סיום לא תקין: ' + re, '#c00'); return; }
        if (s >= e) { _cutStatus('❌ סיום לפני התחלה (' + rs + '–' + re + ')', '#c00'); return; }
        if (e > _cutDecoded.durationSec + 0.5) {
          _cutStatus('❌ ' + re + ' חורג ממשך הקובץ (' + _formatHMS(_cutDecoded.durationSec) + ')', '#c00');
          return;
        }
        ranges.push([s, e]);
      }
      if (!ranges.length) { _cutStatus('❌ הוסף לפחות טווח אחד', '#c00'); return; }

      _cutRunning = true;
      cutGoBtn.disabled = true;
      cutGoBtn.textContent = '⏳ חותך…';
      let saved = 0, cancelled = 0;
      const baseStem = _cutFile.name.replace(/\.[^.]+$/, '');
      try {
        for (let i = 0; i < ranges.length; i++) {
          const s = ranges[i][0], e = ranges[i][1];
          _cutStatus('⏳ קליפ ' + (i+1) + '/' + ranges.length + ' (' + _formatHMS(s) + '–' + _formatHMS(e) + ') · בחר היכן לשמור…');
          const tag = _formatHMS(s).replace(/:/g, '-') + '_to_' + _formatHMS(e).replace(/:/g, '-');
          let res;
          if (_cutMp3Meta) {
            // MP3 byte-slice path — fast, lossless, output is MP3
            const mp3Bytes = _sliceMp3ByTimeBytes(_cutMp3Meta, s, e);
            const blob = new Blob([mp3Bytes], { type: 'audio/mpeg' });
            res = await _saveMp3ViaPicker(blob, baseStem + '_' + tag + '.mp3');
          } else {
            // PCM-decode path — output is WAV
            const slice = _slicePcmSec(_cutDecoded.pcm, s, e, _cutDecoded.sampleRate);
            const wavBytes = _pcmToWavBytes(slice, _cutDecoded.sampleRate);
            const blob = new Blob([wavBytes], { type: 'audio/wav' });
            res = await _saveWavViaPicker(blob, baseStem + '_' + tag + '.wav');
          }
          if (res.method === 'cancelled') cancelled++;
          else saved++;
        }
        _cutStatus('✓ נשמרו ' + saved + '/' + ranges.length + ' קליפים' + (cancelled ? ' · ' + cancelled + ' ביטולים' : ''), '#2d7a2d');
      } catch (err) {
        _cutStatus('❌ ' + err.message, '#c00');
      } finally {
        _cutRunning = false;
        cutGoBtn.disabled = false;
        cutGoBtn.textContent = '✂️ חתוך ושמור קליפים';
      }
    }
    cutGoBtn.addEventListener('click', _cutGo);

    const cutSection = App.el('div', {
      style: { marginTop: '20px', paddingTop: '18px', borderTop: '1px solid var(--line)' }
    }, [
      _stepHeader(2, 'חיתוך אודיו בלבד (אופציונלי) — פלט WAV', '#9b8bb8'),
      _stepHowto([
        'גרור את הקובץ שהורדת לתיבה למטה — <b>MP3 / MP4 / WAV / M4A / WebM</b>',
        'הוסף טווחי זמן <b>בכל אורך</b> שתרצה. דוגמאות: <code style="background:#eee;padding:1px 4px;border-radius:3px;">1:30</code>–<code style="background:#eee;padding:1px 4px;border-radius:3px;">3:00</code> · <code style="background:#eee;padding:1px 4px;border-radius:3px;">5:00</code>–<code style="background:#eee;padding:1px 4px;border-radius:3px;">45:00</code> · <code style="background:#eee;padding:1px 4px;border-radius:3px;">10:00</code>–<code style="background:#eee;padding:1px 4px;border-radius:3px;">1:35:00</code> (90 דק׳!). אין גבול עליון — רק שזמן הסיום ≤ אורך הקובץ',
        '<b>טיפ למהירות:</b> אם הקובץ MP3 — חיתוך ארוך (40 דק׳+) מסתיים ב<b>שניות</b> (byte-slicing). אם MP4 ארוך — מומלץ להוריד מחדש כ-MP3 דרך vidssave',
        'לחץ "<b>✂️ חתוך ושמור קליפים</b>" · לכל קליפ ייפתח דיאלוג שמירה — בחר תיקייה ושם'
      ]),
      cutFileInput, cutZone, cutFileLabel,
      App.el('div', { style: { fontSize: '12px', color: '#777', marginTop: '12px', marginBottom: '4px', fontWeight: '600' } },
        'טווחי החיתוך:'),
      cutRangesContainer,
      cutAddBtn,
      cutGoBtn,
      cutStatusEl
    ]);

    // ── Video cut tool: outputs MP4/WebM clips with both video + audio ────
    let _vcFile = null;
    let _vcDuration = 0;
    let _vcRunning = false;

    const vcFileLabel = document.createElement('div');
    vcFileLabel.style.cssText = 'font-size:12px;color:#888;margin-top:8px;min-height:16px;';
    const vcStatusEl = document.createElement('div');
    vcStatusEl.style.cssText = 'font-size:12px;color:var(--ink-mute);margin-top:8px;line-height:1.55;min-height:16px;';
    function _vcStatus(msg, color) {
      vcStatusEl.textContent = msg;
      vcStatusEl.style.color = color || 'var(--ink-mute)';
    }

    async function _vcLoadFile(file) {
      if (!file || _vcRunning) return;
      _vcFile = file;
      _vcDuration = 0;
      vcFileLabel.textContent = '🎬 ' + file.name + ' · ' + (file.size/1024/1024).toFixed(1) + ' MB · קורא…';
      _vcStatus('⏳ טוען וידאו…');
      try {
        // Probe duration via a temp video element
        const blobUrl = URL.createObjectURL(file);
        const probe = document.createElement('video');
        probe.preload = 'metadata';
        probe.src = blobUrl;
        await new Promise(function(resolve, reject) {
          probe.onloadedmetadata = resolve;
          probe.onerror = function(){ reject(new Error('הדפדפן לא הצליח לטעון את הקובץ כוידאו')); };
          setTimeout(function(){ reject(new Error('טעינה ארוכה מדי')); }, 30000);
        });
        _vcDuration = probe.duration;
        URL.revokeObjectURL(blobUrl);
        const min = (_vcDuration / 60).toFixed(1);
        vcFileLabel.textContent = '🎬 ' + file.name + ' · ' + (file.size/1024/1024).toFixed(1) + ' MB · משך: ' + min + ' דקות';
        _vcStatus('✓ מוכן · הוסף טווחים ולחץ "חתוך וידאו". זכור — חיתוך וידאו רץ בזמן אמת.', '#2d7a2d');
      } catch (e) {
        _vcStatus('❌ ' + e.message, '#c00');
        vcFileLabel.textContent = '';
      }
    }

    const vcFileInput = document.createElement('input');
    vcFileInput.type = 'file';
    vcFileInput.accept = '.mp4,.webm,.mov,.mkv,.avi';
    vcFileInput.style.display = 'none';
    vcFileInput.addEventListener('change', function(){ _vcLoadFile(vcFileInput.files[0]); vcFileInput.value = ''; });

    const vcZone = App.el('div', {
      style: { border: '2px dashed var(--line)', borderRadius: 'var(--r-md)',
               padding: '20px', textAlign: 'center', cursor: 'pointer',
               transition: 'all 180ms', background: 'var(--cream)',
               marginTop: '10px' },
      onClick: function() { if (!_vcRunning) vcFileInput.click(); }
    }, [
      App.el('div', { style: { fontSize: '28px', marginBottom: '4px' } }, '🎬'),
      App.el('div', { style: { fontWeight: 600, fontSize: '13px', marginBottom: '2px' } },
        'גרור וידאו לחיתוך לכאן'),
      App.el('div', { style: { fontSize: '11px', color: 'var(--ink-mute)' } },
        'MP4 / WebM / MOV · הקליפים יישמרו עם וידאו+קול במקום שתבחר')
    ]);
    vcZone.addEventListener('dragover',  function(e) { e.preventDefault(); vcZone.style.borderColor = '#5ba3d0'; vcZone.style.background = '#cfe4f7'; });
    vcZone.addEventListener('dragleave', function()  { vcZone.style.borderColor = 'var(--line)'; vcZone.style.background = 'var(--cream)'; });
    vcZone.addEventListener('drop', function(e) {
      e.preventDefault(); vcZone.style.borderColor = 'var(--line)'; vcZone.style.background = 'var(--cream)';
      _vcLoadFile(e.dataTransfer.files[0]);
    });

    const vcRangesContainer = document.createElement('div');
    vcRangesContainer.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:10px;';
    function _vcAddRangeRow(start, end) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;align-items:center;';
      const startBox = document.createElement('input');
      startBox.type = 'text';
      startBox.placeholder = 'התחלה (1:30)';
      startBox.value = start || '';
      startBox.style.cssText = 'flex:1;padding:6px 10px;border:1px solid #5ba3d0;border-radius:8px;font-size:13px;background:#f0f6fb;direction:ltr;text-align:center;';
      const endBox = document.createElement('input');
      endBox.type = 'text';
      endBox.placeholder = 'סיום (3:00)';
      endBox.value = end || '';
      endBox.style.cssText = startBox.style.cssText;
      const rmBtn = document.createElement('button');
      rmBtn.textContent = '×';
      rmBtn.title = 'הסר קטע';
      rmBtn.style.cssText = 'width:32px;height:32px;background:#cfe4f7;border:1px solid #5ba3d0;border-radius:8px;font-size:16px;cursor:pointer;color:#888;flex-shrink:0;';
      rmBtn.onclick = function(){ row.remove(); };
      row.appendChild(startBox); row.appendChild(endBox); row.appendChild(rmBtn);
      row.__startBox = startBox; row.__endBox = endBox;
      vcRangesContainer.appendChild(row);
    }
    _vcAddRangeRow();

    const vcAddBtn = document.createElement('button');
    vcAddBtn.textContent = '＋ הוסף קטע';
    vcAddBtn.style.cssText = 'padding:6px 14px;background:#fff;border:1px dashed #5ba3d0;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;color:#2d6f9c;margin-top:6px;align-self:flex-start;';
    vcAddBtn.onclick = function(){ _vcAddRangeRow(); };

    const vcGoBtn = document.createElement('button');
    vcGoBtn.textContent = '🎬 חתוך וידאו ושמור';
    vcGoBtn.style.cssText = 'padding:10px 22px;background:linear-gradient(135deg,#cfe4f7,#5ba3d0);border:1px solid #2d6f9c;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;color:#fff;margin-top:12px;align-self:flex-start;';

    async function _vcGo() {
      if (_vcRunning) return;
      if (!_vcFile) { _vcStatus('❌ גרור קובץ וידאו קודם', '#c00'); return; }

      const ranges = [];
      const rows = vcRangesContainer.children;
      for (let i = 0; i < rows.length; i++) {
        const rs = rows[i].__startBox.value.trim();
        const re = rows[i].__endBox.value.trim();
        if (!rs && !re) continue;
        const s = _parseTimeInput(rs);
        const e = _parseTimeInput(re);
        if (Number.isNaN(s) || s == null) { _vcStatus('❌ זמן התחלה לא תקין: ' + rs, '#c00'); return; }
        if (Number.isNaN(e) || e == null) { _vcStatus('❌ זמן סיום לא תקין: ' + re, '#c00'); return; }
        if (s >= e) { _vcStatus('❌ סיום לפני התחלה (' + rs + '–' + re + ')', '#c00'); return; }
        if (e > _vcDuration + 0.5) {
          _vcStatus('❌ ' + re + ' חורג ממשך הקובץ (' + _formatHMS(_vcDuration) + ')', '#c00');
          return;
        }
        ranges.push([s, e]);
      }
      if (!ranges.length) { _vcStatus('❌ הוסף לפחות טווח אחד', '#c00'); return; }

      const totalSec = ranges.reduce(function(t, r){ return t + (r[1] - r[0]); }, 0);

      _vcRunning = true;
      vcGoBtn.disabled = true;
      vcGoBtn.textContent = '⏳ חותך…';
      let saved = 0, cancelled = 0;
      const baseStem = _vcFile.name.replace(/\.[^.]+$/, '');
      try {
        for (let i = 0; i < ranges.length; i++) {
          const s = ranges[i][0], e = ranges[i][1];
          const tag = _formatHMS(s).replace(/:/g, '-') + '_to_' + _formatHMS(e).replace(/:/g, '-');
          _vcStatus('🎬 קליפ ' + (i+1) + '/' + ranges.length + ' (' + _formatHMS(s) + '–' + _formatHMS(e) + ') · חותך עם ffmpeg…');
          const result = await _cutVideoClip(_vcFile, s, e, function(msg){
            _vcStatus('🎬 קליפ ' + (i+1) + '/' + ranges.length + ' · ' + msg);
          });
          _vcStatus('💾 קליפ ' + (i+1) + '/' + ranges.length + ' · ' + result.sizeMB + ' MB ' + result.ext + ' · בחר היכן לשמור…');
          const clipName = baseStem + '_' + tag + result.ext;
          const saveRes = await _saveVideoViaPicker(result.blob, clipName, result.ext);
          if (saveRes.method === 'cancelled') cancelled++;
          else saved++;
        }
        _vcStatus('✓ נשמרו ' + saved + '/' + ranges.length + ' קליפי וידאו' + (cancelled ? ' · ' + cancelled + ' ביטולים' : ''), '#2d7a2d');
      } catch (err) {
        _vcStatus('❌ ' + err.message, '#c00');
      } finally {
        _vcRunning = false;
        vcGoBtn.disabled = false;
        vcGoBtn.textContent = '🎬 חתוך וידאו ושמור';
      }
    }
    vcGoBtn.addEventListener('click', _vcGo);

    const videoCutSection = App.el('div', {
      style: { marginTop: '20px', paddingTop: '18px', borderTop: '1px solid var(--line)' }
    }, [
      _stepHeader('🎬', 'חיתוך וידאו (וידאו+קול)', '#5ba3d0'),
      _stepHowto([
        'גרור קובץ <b>MP4 / WebM / MOV</b> לתיבה למטה (וידאו עם פסקול)',
        'הוסף טווחי זמן <b>בכל אורך</b>. דוגמאות: <code style="background:#eee;padding:1px 4px;border-radius:3px;">2:00</code>–<code style="background:#eee;padding:1px 4px;border-radius:3px;">5:00</code> · <code style="background:#eee;padding:1px 4px;border-radius:3px;">10:00</code>–<code style="background:#eee;padding:1px 4px;border-radius:3px;">50:00</code> · <code style="background:#eee;padding:1px 4px;border-radius:3px;">5:00</code>–<code style="background:#eee;padding:1px 4px;border-radius:3px;">1:35:00</code>. אין מקסימום — מותר עד אורך הקובץ',
        'לחץ "<b>🎬 חתוך וידאו ושמור</b>" — ffmpeg.wasm מבצע <b>stream copy</b> (העתק בייט-בייט בלי לפענח/לקודד). חיתוך של 40 דק׳ מסתיים תוך <b>שניות</b>',
        'פעם ראשונה ffmpeg יורד (~30MB, חד-פעמי, נשמר ב-cache). אחר כך — מיידי. הקליפים נשמרים כ-MP4'
      ]),
      vcFileInput, vcZone, vcFileLabel,
      App.el('div', { style: { fontSize: '12px', color: '#777', marginTop: '12px', marginBottom: '4px', fontWeight: '600' } },
        'טווחי החיתוך:'),
      vcRangesContainer,
      vcAddBtn,
      vcGoBtn,
      vcStatusEl
    ]);

    // ── Merge: combine multiple video files into one ──────────────────────
    let _mergeFiles = [];
    let _mergeRunning = false;

    const mergeStatusEl = document.createElement('div');
    mergeStatusEl.style.cssText = 'font-size:12px;color:var(--ink-mute);margin-top:8px;line-height:1.55;min-height:16px;';
    function _mergeStatus(msg, color) {
      mergeStatusEl.textContent = msg;
      mergeStatusEl.style.color = color || 'var(--ink-mute)';
    }

    const mergeFileInput = document.createElement('input');
    mergeFileInput.type = 'file';
    mergeFileInput.accept = '.mp4,.webm,.mov,.mkv';
    mergeFileInput.multiple = true;
    mergeFileInput.style.display = 'none';
    mergeFileInput.addEventListener('change', function(){
      _mergeAddFiles(Array.from(mergeFileInput.files));
      mergeFileInput.value = '';
    });

    const mergeZone = App.el('div', {
      style: { border: '2px dashed var(--line)', borderRadius: 'var(--r-md)',
               padding: '20px', textAlign: 'center', cursor: 'pointer',
               transition: 'all 180ms', background: 'var(--cream)',
               marginTop: '10px' },
      onClick: function() { if (!_mergeRunning) mergeFileInput.click(); }
    }, [
      App.el('div', { style: { fontSize: '28px', marginBottom: '4px' } }, '🎞️'),
      App.el('div', { style: { fontWeight: 600, fontSize: '13px', marginBottom: '2px' } },
        'גרור או בחר 2+ סרטונים לאיחוד'),
      App.el('div', { style: { fontSize: '11px', color: 'var(--ink-mute)' } },
        'MP4 / WebM / MOV · הקובץ הסופי יישמר כ-MP4')
    ]);
    mergeZone.addEventListener('dragover',  function(e) { e.preventDefault(); mergeZone.style.borderColor = '#f5c842'; mergeZone.style.background = '#fff7d6'; });
    mergeZone.addEventListener('dragleave', function()  { mergeZone.style.borderColor = 'var(--line)'; mergeZone.style.background = 'var(--cream)'; });
    mergeZone.addEventListener('drop', function(e) {
      e.preventDefault(); mergeZone.style.borderColor = 'var(--line)'; mergeZone.style.background = 'var(--cream)';
      _mergeAddFiles(Array.from(e.dataTransfer.files));
    });

    const mergeListContainer = document.createElement('div');
    mergeListContainer.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-top:12px;';

    function _mergeAddFiles(files) {
      for (const f of files) {
        if (f && f.size > 0) _mergeFiles.push(f);
      }
      _renderMergeList();
    }

    function _renderMergeList() {
      mergeListContainer.innerHTML = '';
      if (_mergeFiles.length === 0) {
        const empty = document.createElement('div');
        empty.textContent = 'עדיין לא נבחרו סרטונים';
        empty.style.cssText = 'font-size:12px;color:#999;font-style:italic;text-align:center;padding:8px;';
        mergeListContainer.appendChild(empty);
        return;
      }
      _mergeFiles.forEach(function(file, i) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;align-items:center;padding:8px 10px;background:#fff;border:1px solid #e0d4a0;border-radius:6px;';

        const num = document.createElement('span');
        num.textContent = (i + 1) + '.';
        num.style.cssText = 'min-width:24px;color:#666;font-weight:700;font-size:13px;';
        row.appendChild(num);

        const upBtn = document.createElement('button');
        upBtn.innerHTML = '▲';
        upBtn.disabled = (i === 0);
        upBtn.title = 'הזז למעלה';
        upBtn.style.cssText = 'width:26px;height:26px;background:#fff7d6;border:1px solid #d0c080;border-radius:4px;cursor:pointer;font-size:10px;color:#5a4a00;' + (i === 0 ? 'opacity:0.4;' : '');
        upBtn.onclick = function() {
          if (i > 0) {
            const tmp = _mergeFiles[i - 1];
            _mergeFiles[i - 1] = _mergeFiles[i];
            _mergeFiles[i] = tmp;
            _renderMergeList();
          }
        };
        row.appendChild(upBtn);

        const downBtn = document.createElement('button');
        downBtn.innerHTML = '▼';
        downBtn.disabled = (i === _mergeFiles.length - 1);
        downBtn.title = 'הזז למטה';
        downBtn.style.cssText = upBtn.style.cssText;
        if (i !== _mergeFiles.length - 1) downBtn.style.opacity = '1';
        else downBtn.style.opacity = '0.4';
        downBtn.onclick = function() {
          if (i < _mergeFiles.length - 1) {
            const tmp = _mergeFiles[i + 1];
            _mergeFiles[i + 1] = _mergeFiles[i];
            _mergeFiles[i] = tmp;
            _renderMergeList();
          }
        };
        row.appendChild(downBtn);

        const info = document.createElement('span');
        info.textContent = file.name + ' · ' + (file.size / 1024 / 1024).toFixed(1) + ' MB';
        info.title = file.name;
        info.style.cssText = 'flex:1;font-size:12px;color:#444;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:ltr;text-align:right;';
        row.appendChild(info);

        const rmBtn = document.createElement('button');
        rmBtn.textContent = '×';
        rmBtn.title = 'הסר מהרשימה';
        rmBtn.style.cssText = 'width:28px;height:28px;background:#fff;border:1px solid #ddd;border-radius:6px;cursor:pointer;color:#999;font-size:14px;';
        rmBtn.onclick = function() { _mergeFiles.splice(i, 1); _renderMergeList(); };
        row.appendChild(rmBtn);

        mergeListContainer.appendChild(row);
      });
    }
    _renderMergeList();

    const mergeGoBtn = document.createElement('button');
    mergeGoBtn.textContent = '🎞️ חבר ושמור';
    mergeGoBtn.style.cssText = 'padding:10px 22px;background:linear-gradient(135deg,#fff1c0,#f5c842);border:1px solid #d0c080;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;color:#3b3a3a;margin-top:12px;align-self:flex-start;';

    async function _mergeGo() {
      if (_mergeRunning) return;
      if (_mergeFiles.length < 2) {
        _mergeStatus('❌ צריך לפחות 2 סרטונים לאיחוד', '#c00');
        return;
      }
      _mergeRunning = true;
      mergeGoBtn.disabled = true;
      mergeGoBtn.textContent = '⏳ מעבד…';
      try {
        const blob = await _mergeVideos(_mergeFiles, function(msg){ _mergeStatus('⏳ ' + msg); });
        const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
        _mergeStatus('💾 קובץ מאוחד מוכן (' + sizeMB + ' MB) · בחר היכן לשמור…');
        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
        const res = await _saveVideoViaPicker(blob, 'merged_' + stamp + '.mp4', '.mp4');
        if (res.method === 'cancelled') {
          _mergeStatus('ℹ️ ביטלת את השמירה — הקובץ עדיין בזיכרון, לחץ שוב לשמור', '#888');
        } else {
          _mergeStatus('✓ הקובץ המאוחד נשמר! ' + sizeMB + ' MB מ-' + _mergeFiles.length + ' סרטונים', '#2d7a2d');
        }
      } catch (err) {
        _mergeStatus('❌ ' + err.message, '#c00');
        console.error('[merge]', err);
      } finally {
        _mergeRunning = false;
        mergeGoBtn.disabled = false;
        mergeGoBtn.textContent = '🎞️ חבר ושמור';
      }
    }
    mergeGoBtn.addEventListener('click', _mergeGo);

    const mergeSection = App.el('div', {
      style: { marginTop: '20px', paddingTop: '18px', borderTop: '1px solid var(--line)' }
    }, [
      _stepHeader('🎞️', 'חיבור כמה סרטונים לסרטון 1', '#f5c842'),
      _stepHowto([
        'גרור או בחר <b>2 סרטונים או יותר</b> (MP4 / WebM / MOV) — אפשר להוסיף כמה פעמים',
        'סדר אותם ברשימה למטה ע"י החיצים <b>▲▼</b> — סדר הרשימה הוא הסדר בקובץ המאוחד',
        'לחץ "<b>🎞️ חבר ושמור</b>" — ffmpeg.wasm רץ ב-Web Worker (ברקע, אינו מעמיס על הדפדפן). פעם ראשונה: ~30MB ההורדה (cache לתמיד)',
        'אם כל הסרטונים באותו קודק (כולם מ-YouTube/אותו מקור): <b>שניות</b> (stream copy). אחרת: re-encoding לוקח זמן יותר'
      ]),
      mergeFileInput, mergeZone,
      App.el('div', { style: { fontSize: '12px', color: '#777', marginTop: '12px', marginBottom: '4px', fontWeight: '600' } },
        'סדר ההופעה בסרטון המאוחד:'),
      mergeListContainer,
      mergeGoBtn,
      mergeStatusEl
    ]);

    const infoBanner = App.el('div', {
      style: { background: '#f0f6fb', border: '1px solid #a0c8e8',
               borderRadius: 'var(--r-sm)', padding: '10px 14px', marginBottom: '14px', lineHeight: '1.55' }
    }, [
      App.el('span', { style: { fontSize: '12px', color: 'var(--ink-mute)' } },
        '🎙 הזרימה: שלב 1 (הורדה מ-YouTube) → שלב 2 (חיתוך, אופציונלי) → שלב 3 (תמלול בענן). כל קובץ — Whisper-Large-v3-Turbo בענן, ללא עומס על המחשב.')
    ]);

    // ── Step 3: transcribe — wrap the existing drop zone with a header ─────
    const transcribeSection = App.el('div', {
      style: { marginTop: '20px', paddingTop: '18px', borderTop: '1px solid var(--line)' }
    }, [
      _stepHeader(3, 'לתמלל את הקובץ בענן ולשמור Word במחשב', '#2d7a2d'),
      _stepHowto([
        'גרור את הקובץ (המקורי או קליפ משלב 2) לתיבה למטה',
        'הענן מתמלל אוטומטית ב-<b>Whisper-Large-v3-Turbo</b> (איכות מקסימלית, ללא עומס על המחשב)',
        'בסיום ייפתח דיאלוג שמירה — <b>בחר תיקייה ושם לקובץ ה-Word</b>',
        'אפשר לפתוח <b>⚙️ הגדרות מתקדמות</b> למצב offline או טווח חלקי'
      ]),
      fileInput, zone, statusEl, barTrack, bgBadge,
      advPanel
    ]);

    return App.el('div', { class: 'card' }, [
      App.el('div', { class: 'row row-between', style: { marginBottom: '16px' } }, [
        App.el('h2', {}, '🎙  תמלול וידאו בעברית'),
        App.el('span', { class: 'chip sky' }, 'Whisper AI · ענן · ללא עלות')
      ]),
      infoBanner,
      ytSection,         // Step 1: download from YouTube
      cutSection,        // Step 2: cut audio (WAV/MP3 output) — optional
      videoCutSection,   // Bonus: cut video (MP4/WebM output) — optional
      mergeSection,      // Bonus: merge multiple videos into one (ffmpeg.wasm)
      transcribeSection  // Step 3: transcribe in cloud
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
