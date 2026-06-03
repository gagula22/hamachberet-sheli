(function () {
  // PDF translator (EN->HE). Extracted from stickers.js.
  function initPdfJs() {
    if (!window.pdfjsLib) return;
    const base = location.href.replace(/#.*/, '').replace(/index\.html.*/, '');
    pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'js/vendor/pdfjs.worker.min.js';
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
  window.Tools = window.Tools || {};
  window.Tools.pdfTranslator = buildPdfTranslator;
})();