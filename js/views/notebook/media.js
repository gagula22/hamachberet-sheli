(function () {
  // Notebook media: images, file attachments, table resizers, mood blocks.
  // Pure leaf — only uses App / Editable / DOM and the save callback. No tree/state.
  // (insertImage is the canonical impl; the old _unused_insertImageFromFile helper
  //  was dead code — image insertion routes through Editable/this insertImage.)

  function insertImage(dataUrl, editor) {
    editor.focus();
    const fig = document.createElement('figure');
    fig.className = 'nb-img';
    fig.contentEditable = 'false';
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = '';
    fig.appendChild(img);

    const sel = window.getSelection();
    if (sel && sel.rangeCount && editor.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(fig);
      const space = document.createTextNode(' ');
      fig.after(space);
      const r2 = document.createRange();
      r2.setStartAfter(space);
      r2.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r2);
    } else {
      editor.appendChild(fig);
      editor.appendChild(document.createTextNode(' '));
    }
  }

  function restoreMoodBlocks(editor) {
    editor.querySelectorAll('.nb-mood-embed').forEach(block => {
      const level = block.dataset.level || '';
      block.querySelectorAll('.nb-mood-btn').forEach(b => {
        b.classList.toggle('selected', b.dataset.level === level);
      });
      const ta = block.querySelector('.nb-mood-note');
      if (ta) ta.value = block.dataset.note || '';
    });
  }

  function attachMoodBehaviors(editor, save) {
    editor.addEventListener('click', (e) => {
      const btn = e.target.closest('.nb-mood-btn');
      if (!btn) return;
      const block = btn.closest('.nb-mood-embed');
      if (!block) return;
      const level = btn.dataset.level;
      block.dataset.level = level;
      block.querySelectorAll('.nb-mood-btn').forEach(b =>
        b.classList.toggle('selected', b.dataset.level === level)
      );
      save();
    });
    editor.addEventListener('input', (e) => {
      if (e.target.classList.contains('nb-mood-note')) {
        const block = e.target.closest('.nb-mood-embed');
        if (block) { block.dataset.note = e.target.value; save(); }
      }
    }, true);
  }

  // ── Image insertion via img-wrap with corner resize handles ──────────────
  const A4_MAX_W = 640;

  function insertImageFile(file, editor, save) {
    if (!file || !file.type || !file.type.startsWith('image/')) return;
    const MAX = 8 * 1024 * 1024;
    if (file.size > MAX) {
      if (!confirm('התמונה גדולה (' + _fmtSize(file.size) + '). להמשיך?')) return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      const probe = new Image();
      probe.onload = () => {
        const initialW = Math.min(probe.naturalWidth, A4_MAX_W);
        const html = '<span class="img-wrap" contenteditable="false">'
          + '<img src="' + dataUrl + '" alt="" style="width:' + initialW + 'px;height:auto;" />'
          + '<span class="img-resize-handle br" title="גרור לשינוי גודל"></span>'
          + '<span class="img-resize-handle bl" title="גרור לשינוי גודל"></span>'
          + '<span class="img-resize-tip"></span>'
          + '</span>&nbsp;';
        editor.focus();
        document.execCommand('insertHTML', false, html);
        save();
        App.toast('תמונה נוספה (' + initialW + 'px)');
      };
      probe.onerror = () => {
        const html = '<span class="img-wrap" contenteditable="false">'
          + '<img src="' + dataUrl + '" alt="" />'
          + '<span class="img-resize-handle br"></span>'
          + '<span class="img-resize-handle bl"></span>'
          + '<span class="img-resize-tip"></span>'
          + '</span>&nbsp;';
        editor.focus();
        document.execCommand('insertHTML', false, html);
        save();
      };
      probe.src = dataUrl;
    };
    reader.onerror = () => App.toast('שגיאה בקריאת הקובץ');
    reader.readAsDataURL(file);
  }

  // ── Table column resize handles ──────────────────────────────────────────
  // Called on editor load, after undo/redo, and after inserting a new table.
  // Uses requestAnimationFrame so offsetWidth values are real rendered widths.
  function attachTableResizers(editorEl, saveFn) {
    requestAnimationFrame(() => {
      editorEl.querySelectorAll('table').forEach(table => {
        _attachResizersToTable(table, saveFn);
      });
    });
  }

  function _attachResizersToTable(table, saveFn) {
    // Skip if handles already present (e.g. called twice before RAF fires)
    if (table.querySelector('.nb-col-resize-handle')) return;

    // Ensure word-wrap on every cell (fixes old tables that lack it)
    table.querySelectorAll('td, th').forEach(cell => {
      cell.style.wordBreak = 'break-word';
      cell.style.overflowWrap = 'break-word';
    });
    table.style.tableLayout = 'fixed';

    const firstRow = table.querySelector('tr');
    if (!firstRow) return;
    const cells = Array.from(firstRow.querySelectorAll('th, td'));
    if (cells.length < 2) return; // single-column — nothing to resize

    let cg = table.querySelector('colgroup');
    const existingCols = cg ? Array.from(cg.querySelectorAll('col')) : [];

    // Build/replace colgroup when missing or column count mismatches
    if (!cg || existingCols.length !== cells.length) {
      if (cg) cg.remove();
      const tableW = table.offsetWidth || 1;
      cg = document.createElement('colgroup');
      cells.forEach(cell => {
        const col = document.createElement('col');
        const pct = Math.max(5, Math.round((cell.offsetWidth / tableW) * 100));
        col.style.width = pct + '%';
        cg.appendChild(col);
      });
      table.insertBefore(cg, table.firstChild);
    }

    const cols = Array.from(cg.querySelectorAll('col'));
    const numCols = cols.length;
    // RTL tables: dragging the handle right shrinks the column to its right (physical)
    const isRTL = getComputedStyle(table).direction === 'rtl';

    cells.forEach((cell, i) => {
      if (i >= numCols - 1) return; // no handle after the last column

      const handle = document.createElement('span');
      handle.className = 'nb-col-resize-handle';
      handle.setAttribute('contenteditable', 'false');
      handle.title = 'גרור לשינוי רוחב עמודה';
      cell.appendChild(handle);

      handle.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        const tW    = table.offsetWidth || 1;
        const startX = ev.clientX;
        const colA   = cols[i];
        const colB   = cols[i + 1];
        const sPctA  = parseFloat(colA.style.width) || (100 / numCols);
        const sPctB  = parseFloat(colB.style.width) || (100 / numCols);
        const minPct = 5;
        const maxPctA = sPctA + sPctB - minPct;

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        handle.classList.add('active');

        function onMove(e2) {
          const dx = e2.clientX - startX;
          // RTL: separator physical-left belongs to col[i+1]→drag right shrinks col[i]
          const eff  = isRTL ? -dx : dx;
          const dPct = (eff / tW) * 100;
          const newA = Math.max(minPct, Math.min(maxPctA, sPctA + dPct));
          const newB = sPctA + sPctB - newA;
          colA.style.width = newA.toFixed(2) + '%';
          colB.style.width = newB.toFixed(2) + '%';
        }

        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          document.body.style.cursor    = '';
          document.body.style.userSelect = '';
          handle.classList.remove('active');
          if (saveFn) saveFn();
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });
  }

  // Wrap plain <img> elements from old saved content with resize handles
  function wrapImagesInEditor(editor) {
    editor.querySelectorAll('img').forEach(img => {
      if (img.classList.contains('file-thumb')) return;
      if (img.closest('.img-wrap') || img.closest('figure.nb-img')) return;
      const wrap = document.createElement('span');
      wrap.className = 'img-wrap';
      wrap.setAttribute('contenteditable', 'false');
      if (!img.style.width) {
        const natW = img.naturalWidth || 0;
        if (natW > 0) {
          img.style.width = Math.min(natW, A4_MAX_W) + 'px';
          img.style.height = 'auto';
        }
      }
      img.parentNode.insertBefore(wrap, img);
      wrap.appendChild(img);
      ['br', 'bl'].forEach(pos => {
        const h = document.createElement('span');
        h.className = 'img-resize-handle ' + pos;
        h.title = 'גרור לשינוי גודל';
        wrap.appendChild(h);
      });
      const tip = document.createElement('span');
      tip.className = 'img-resize-tip';
      wrap.appendChild(tip);
    });
  }

  // Corner handle resize — called on mousedown on .img-resize-handle
  function startImageResize(e, editor, save) {
    const handle = e.target;
    const wrap = handle.closest('.img-wrap');
    if (!wrap) return;
    const img = wrap.querySelector('img');
    if (!img) return;
    e.preventDefault(); e.stopPropagation();
    const tip = wrap.querySelector('.img-resize-tip');
    const isLeft = handle.classList.contains('bl');
    const startX = e.clientX;
    const startW = img.offsetWidth || img.naturalWidth || 200;
    const startH = img.offsetHeight || img.naturalHeight || 150;
    const aspect = startH > 0 ? startW / startH : 1;
    document.body.style.cursor = isLeft ? 'nesw-resize' : 'nwse-resize';
    document.body.style.userSelect = 'none';
    wrap.classList.add('resizing');
    if (tip) tip.textContent = startW + 'px';
    function onMove(ev) {
      let dx = ev.clientX - startX;
      if (isLeft) dx = -dx;
      const newW = Math.max(60, Math.min(A4_MAX_W, Math.round(startW + dx)));
      img.style.width = newW + 'px';
      img.style.height = Math.round(newW / aspect) + 'px';
      if (tip) tip.textContent = newW + 'px' + (newW === A4_MAX_W ? ' (מקס)' : '');
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      wrap.classList.remove('resizing');
      save();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ── File-attachment helpers (shared by cloud + local paths) ──────────────
  function _fileIcon(name, type) {
    type = type || ''; name = name || '';
    return type.startsWith('image/') ? '🖼️'
      : type.includes('pdf') ? '📕'
      : (type.includes('word') || /\.docx?$/i.test(name)) ? '📄'
      : (type.includes('excel') || /\.xlsx?$/i.test(name)) ? '📊'
      : type.includes('video') ? '🎬'
      : type.includes('audio') ? '🎵'
      : '📎';
  }
  function _escAttr(s) { return String(s == null ? '' : s).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // meta: { name, type, size, id, and ONE source:
  //   fs:true      → קובץ ב-Firestore (data-fs=id) — נטען על-פי-דרישה, מסתנכרן
  //   url?+path?   → קובץ ב-Storage (מדור קודם; data-url) — עדיין נפתח
  //   dataUrl?     → base64 מקומי (data-content) — מכשיר זה בלבד }
  function _attachHtml(meta) {
    var esc = _escAttr(meta.name);
    var isImg = (meta.type || '').startsWith('image/');
    var thumb = meta.dataUrl || meta.url || '';   // ל-fs אין thumb → אייקון (הקובץ נטען בפתיחה)
    var visual = isImg && thumb ? '<img class="file-thumb" src="' + thumb + '" alt="" />'
      : '<span class="file-icon">' + _fileIcon(meta.name, meta.type) + '</span>';
    var srcAttr = meta.fs
      ? 'data-fs="' + _escAttr(meta.id || '') + '"'
      : meta.url
        ? 'data-url="' + _escAttr(meta.url) + '" data-path="' + _escAttr(meta.path || '') + '"'
        : 'data-content="' + (meta.dataUrl || '') + '"';
    return '<span class="file-attachment" contenteditable="false" data-att-id="' + (meta.id || '') + '" '
      + 'data-name="' + esc + '" data-type="' + _escAttr(meta.type) + '" ' + srcAttr
      + ' title="⬇ הורדה · לחיצה כפולה לפתיחה">' + visual
      + '<span class="file-name">' + esc + '</span><span class="file-size">' + _fmtSize(meta.size) + '</span>'
      + '<button class="file-download" title="הורד לתיקיית ההורדות">⬇</button>'
      + '<button class="file-remove" title="הסר">×</button></span>&nbsp;';
  }

  // NOTE: the ⬇ download / × remove buttons and double-click-to-open are ALL
  // delegated on the editor element (editor.js), NOT wired per-card. Delegation
  // survives reload for free — per-card handlers would be wiped when the editor's
  // innerHTML is rebuilt on load, and a persisted `data-wired` flag would then
  // block re-wiring. So freshly-inserted cards need no wiring call at all.

  // Download the file to the browser's downloads folder (the ⬇ button).
  function downloadAttachment(el) {
    var name = el.dataset.name || 'file';
    var url = el.dataset.url;
    if (url) {
      // Legacy cloud-Storage file: a cross-origin download attribute is ignored by
      // browsers, so this may open in a tab where the user saves it. (True forced
      // download of a Storage file needs bucket CORS — a tab is the reliable
      // no-setup fallback.)
      var a = document.createElement('a'); a.href = url; a.download = name; a.target = '_blank'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      App.toast('⬇ ' + name);
      return;
    }
    var fsId = el.dataset.fs;
    if (fsId) {
      if (!window.CloudFiles) { App.toast('טעינת קבצי-ענן לא זמינה'); return; }
      App.toast('טוען מהענן…');
      window.CloudFiles.fetch(fsId).then(function (f) {
        var blob; try { blob = _dataUrlToBlob(f.dataUrl); } catch (e) { App.toast('שגיאה בהורדה'); return; }
        var burl = URL.createObjectURL(blob);
        _download(burl, name);
        setTimeout(function () { URL.revokeObjectURL(burl); }, 4000);
        App.toast('⬇ הורד: ' + name);
      }).catch(function (e) {
        App.toast('שגיאה בטעינת הקובץ מהענן (ייתכן שההעלאה לא הושלמה)');
      });
      return;
    }
    var dataUrl = el.dataset.content;
    if (!dataUrl) { App.toast('תוכן הקובץ אינו זמין'); return; }
    var blob; try { blob = _dataUrlToBlob(dataUrl); } catch (e) { App.toast('שגיאה בהורדה'); return; }
    var burl = URL.createObjectURL(blob);
    _download(burl, name);
    setTimeout(function () { URL.revokeObjectURL(burl); }, 4000);
    App.toast('⬇ הורד: ' + name);
  }

  function _dataUrlToBlob(dataUrl) {
    var m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(dataUrl) || [];
    var mime = m[1] || 'application/octet-stream';
    var bytes;
    if (m[2]) { var bin = atob(m[3] || ''); bytes = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); }
    else { bytes = new TextEncoder().encode(decodeURIComponent(m[3] || '')); }
    return new Blob([bytes], { type: mime });
  }
  function _download(url, name) {
    var a = document.createElement('a'); a.href = url; a.download = name || 'file';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  // Preview a data-URL in a new tab (image/PDF/text/AV) or download it. A base64
  // data-URI in an iframe FAILS to render for large files (the "blank tab" bug),
  // so it's converted to a Blob URL, which renders reliably and can be downloaded.
  function _previewOrDownloadDataUrl(dataUrl, name, type) {
    var blob; try { blob = _dataUrlToBlob(dataUrl); } catch (e) { App.toast('שגיאה בפתיחת הקובץ'); return; }
    var burl = URL.createObjectURL(blob);
    var previewable = type.startsWith('image/') || type === 'application/pdf'
      || type.startsWith('text/') || type.startsWith('video/') || type.startsWith('audio/');
    if (previewable) {
      var w = window.open(burl, '_blank', 'noopener');
      if (!w) _download(burl, name);
      setTimeout(function () { URL.revokeObjectURL(burl); }, 60000);
    } else {
      _download(burl, name);
      setTimeout(function () { URL.revokeObjectURL(burl); }, 4000);
      App.toast('הורד: ' + name);
    }
  }

  // Open/preview an attachment. Cloud-Storage files (legacy data-url) open in a
  // new tab; Firestore files (data-fs) are fetched on demand then previewed;
  // local base64 (data-content) is previewed directly.
  function openAttachment(el) {
    var url = el.dataset.url;
    var name = el.dataset.name || 'file';
    var type = el.dataset.type || '';
    if (url) { var wc = window.open(url, '_blank', 'noopener'); if (!wc) _download(url, name); return; }
    var fsId = el.dataset.fs;
    if (fsId) {
      if (!window.CloudFiles) { App.toast('טעינת קבצי-ענן לא זמינה'); return; }
      App.toast('טוען מהענן…');
      window.CloudFiles.fetch(fsId).then(function (f) {
        _previewOrDownloadDataUrl(f.dataUrl, name, f.type || type);
      }).catch(function (e) {
        App.toast('שגיאה בטעינת הקובץ מהענן (ייתכן שההעלאה לא הושלמה)');
      });
      return;
    }
    var dataUrl = el.dataset.content;
    if (!dataUrl) { App.toast('תוכן הקובץ אינו זמין (ייתכן שנשמר במכשיר אחר)'); return; }
    _previewOrDownloadDataUrl(dataUrl, name, type);
  }

  // ── Insert a file attachment. Prefers Firebase Storage: the FILE goes to the
  // CLOUD and the note stores only a small URL → the note syncs fully to
  // Firestore and the file is available from every device. Falls back to a local
  // base64 embed when not signed in / Storage unavailable — the previous
  // behaviour, so nothing breaks. (Owner: P-12; cloud upload via window.CloudFiles.)
  function insertFileAttachment(file, editor, save) {
    var HARD_CAP = 50 * 1024 * 1024; // 50 MB
    if (file.size > HARD_CAP) { App.toast('הקובץ גדול מדי (מעל 50MB)'); return; }
    var id = 'att' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    if (window.CloudFiles && CloudFiles.enabled() && CloudFiles.fits(file.size)) {
      // placeholder → upload to Firestore → swap in the real (data-fs) card
      var ph = '<span class="file-attachment file-uploading" contenteditable="false" data-att-id="' + id + '">'
        + '<span class="file-icon">⏳</span><span class="file-name">' + _escAttr(file.name) + '</span>'
        + '<span class="file-size">מעלה 0%…</span></span>&nbsp;';
      editor.focus();
      document.execCommand('insertHTML', false, ph);
      // live progress on the placeholder so a slow upload looks like it's moving
      var onProgress = function (frac) {
        var sz = editor.querySelector('.file-attachment[data-att-id="' + id + '"] .file-size');
        if (sz) sz.textContent = 'מעלה ' + Math.round(frac * 100) + '%…';
      };
      CloudFiles.upload(file, id, onProgress).then(function (meta) {
        meta.id = id;
        var node = editor.querySelector('.file-attachment[data-att-id="' + id + '"]');
        if (node) {
          var tmp = document.createElement('div'); tmp.innerHTML = _attachHtml(meta);
          var real = tmp.firstChild; node.replaceWith(real);   // buttons handled by editor delegation
        }
        save();
        App.toast('☁️ הקובץ נשמר בענן — זמין מכל מכשיר: ' + file.name);
      }).catch(function (err) {
        var code = (err && (err.code || err.message)) || 'unknown';
        console.warn('[cloud-files] upload failed (' + code + ') → local fallback', err);
        App.toast('⚠️ העלאה לענן נכשלה (' + code + ') — נשמר מקומית');
        _embedLocalAttachment(file, editor, save, id);
      });
      return;
    }
    _embedLocalAttachment(file, editor, save, id);   // not signed in / too large / cloud off
  }

  function _embedLocalAttachment(file, editor, save, id) {
    if (file.size > 5 * 1024 * 1024 && !confirm('הקובץ גדול (' + _fmtSize(file.size) + ') ויישמר מקומית בלבד. להמשיך?')) {
      var p = editor.querySelector('.file-attachment[data-att-id="' + id + '"]'); if (p) p.remove();
      return;
    }
    var reader = new FileReader();
    reader.onload = function (ev) {
      var meta = { name: file.name, type: file.type || '', size: file.size, id: id, dataUrl: String(ev.target.result) };
      var existing = editor.querySelector('.file-attachment[data-att-id="' + id + '"]');
      var real;
      if (existing) {
        var tmp = document.createElement('div'); tmp.innerHTML = _attachHtml(meta);
        real = tmp.firstChild; existing.replaceWith(real);
      } else {
        editor.focus();
        document.execCommand('insertHTML', false, _attachHtml(meta));
        real = editor.querySelector('.file-attachment[data-att-id="' + id + '"]');
      }
      save();   // buttons handled by editor delegation — no per-card wiring
      App.toast('📎 צורף: ' + file.name);
    };
    reader.onerror = function () { App.toast('שגיאה בקריאת הקובץ'); };
    reader.readAsDataURL(file);
  }
  function _fmtSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }
  // Image insertion is unified to the canonical implementation in
  // components/editable/image.js (figure.nb-img + compression), so paste,
  // toolbar and drag-drop all produce identical images. (The local
  // insertImage / insertImageFile above are now unused legacy code.)
  // ── ריפוי-אוטומטי: קבצים מקומיים-בלבד → ענן (P-12, 15.7.2026) ────────────
  // קובץ שצורף במצב-נפילה (data-content base64) חי רק במכשיר שצירף אותו:
  // שומר-הגודל של הסנכרון (_sizeSafeTopic) מרוקן אותו מהעותק-בענן (>900KB),
  // והמכשירים האחרים מקבלים כרטיס ריק — "אני לא רואה את הקובץ ממחשב אחר".
  // ברגע שהענן זמין, מעלים כל קובץ כזה ל-Firestore-chunks ומחליפים את הכרטיס
  // ל-data-fs — בדיוק כמו צירוף חדש. אידמפוטנטי (אותו data-att-id ⇒ אותו מסמך
  // בענן), רץ ברקע אחד-אחד (זיכרון נמוך), מדלג על כרטיסים ריקים (העותק החתוך
  // שבמכשירים אחרים — אין שם מה להעלות) ועל קבצים מעל תקרת-הענן (20MB).
  var _upgrading = Object.create(null);   // data-att-id → בתהליך-העלאה (מונע כפל כשעורך נבנה-מחדש באמצע)
  var _upgraded  = Object.create(null);   // data-att-id → meta של העלאה שהושלמה בסשן. ⚠️ חיוני: השמירה
                                          // דחויה (debounce 500ms) — בנייה-מחדש שמגיעה לפני שהגוף נשמר
                                          // קוראת עדיין data-content ישן; בלי המטמון הקובץ היה עולה שוב.
  function upgradeLocalAttachments(editor, save) {
    if (!(window.CloudFiles && CloudFiles.enabled && CloudFiles.enabled())) return;
    var cards = Array.prototype.slice.call(
      editor.querySelectorAll('.file-attachment[data-content^="data:"]'));
    if (!cards.length) return;
    (async function () {
      var done = 0;
      for (var i = 0; i < cards.length; i++) {
        var el = cards[i];
        var szEl = el.querySelector('.file-size');
        var szOrig = szEl ? szEl.textContent : '';
        var id = el.dataset.attId || ('att' + Date.now().toString(36) + i);
        if (_upgraded[id]) {               // כבר הועלה בסשן — רק מחליפים את הכרטיס הישן
          if (el.isConnected) {
            var tmp0 = document.createElement('div');
            tmp0.innerHTML = _attachHtml(_upgraded[id]);
            el.replaceWith(tmp0.firstChild);
            save();
            done++;
          }
          continue;
        }
        if (_upgrading[id]) continue;      // עולה כרגע מבנייה קודמת של העורך
        _upgrading[id] = true;
        try {
          var dataUrl = el.getAttribute('data-content') || '';
          if (dataUrl.indexOf('data:') !== 0 || dataUrl.length < 100) continue;
          var name = el.dataset.name || 'file';
          var blob = await (await fetch(dataUrl)).blob();
          if (!CloudFiles.fits(blob.size)) continue;   // מעל 20MB — נשאר מקומי בכוונה
          var type = el.dataset.type || blob.type || '';
          var meta = await CloudFiles.upload(new File([blob], name, { type: type }), id, function (frac) {
            if (szEl) szEl.textContent = 'מעלה לענן ' + Math.round(frac * 100) + '%…';
          });
          meta.id = id;
          _upgraded[id] = meta;                        // גם אם הכרטיס כבר לא מחובר — הבנייה הבאה תחליף מהמטמון
          if (el.isConnected) {                        // המשתמש אולי כבר עבר פתק — לא נוגעים
            var tmp = document.createElement('div');
            tmp.innerHTML = _attachHtml(meta);
            el.replaceWith(tmp.firstChild);
            save();
            done++;
          }
        } catch (e) {
          console.warn('[media] cloud-upgrade of local attachment failed:', e && e.message);
          if (szEl) szEl.textContent = szOrig;         // מחזירים את תווית-הגודל — ינוסה בפתיחה הבאה
        } finally {
          delete _upgrading[id];
        }
      }
      if (done && window.App) App.toast('☁️ ' + done + ' קבצים מקומיים הועלו לענן — יהיו זמינים מכל מכשיר');
    })();
  }

  // ── תמונות-פתק כבדות → ענן (P-12, 23.7.2026) ─────────────────────────────
  // הבעיה: פתק שגופו חוצה ~900KB מסונכרן טקסט-בלבד (שומר-הגודל של הסנכרון חותך
  // base64) — התמונות נשארו במכשיר שיצר אותן. הפתרון: כשהגוף חוצה סף, התמונות
  // הגדולות עוברות לאחסון-הענן של הקבצים המצורפים (Firestore-chunks):
  // ה-<img> מקבל data-fsimg="<id>", בגוף-השמור ה-src מוחלף ב-placeholder זעיר
  // (getCleanHTML ב-editor.js), הגוף יורד מתחת לסף ומסתנכרן מלא, ובכל מכשיר
  // hydrateCloudImages מזריק את ה-src מהמטמון המקומי או מהענן.
  // ⚠️ ה-placeholder הוא SVG בכוונה — לא ה-GIF-1×1 של שומר-הגודל: מגן-המדיה
  // (_isStrippedTopic ב-firebase-sync) מזהה את ה-GIF ההוא כ"עותק חתוך" והיה
  // חוסם את קבלת הגוף-המומר במכשירים אחרים. אסור להחליף ל-GIF הזה!
  var FSIMG_PLACEHOLDER = 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%224%22%20height=%223%22%3E%3Crect%20width=%224%22%20height=%223%22%20fill=%22%23f1ece2%22/%3E%3C/svg%3E';
  var IMG_CONVERT_WHEN = 800 * 1024;    // גוף גדול מזה ⇒ ממירים (מרווח מתחת ל-900KB של הסנכרון)
  var IMG_CONVERT_TARGET = 650 * 1024;  // ממירים תמונות (גדולה-תחילה) עד שהגוף יורד לכאן

  // מטמון תמונות-ענן מקומי (IndexedDB) — נכתב בהמרה (מכשיר-המקור) ובשליפה
  // (שאר המכשירים) ⇒ צפייה offline אחרי שהתמונה נראתה פעם אחת.
  var IMGDB = 'hamachberet-imgcache';
  var _imgDbP = null;
  function _imgDb() {
    if (_imgDbP) return _imgDbP;
    _imgDbP = new Promise(function (res, rej) {
      var q = indexedDB.open(IMGDB, 1);
      q.onupgradeneeded = function () { if (!q.result.objectStoreNames.contains('imgs')) q.result.createObjectStore('imgs', { keyPath: 'id' }); };
      q.onsuccess = function () { res(q.result); };
      q.onerror = function () { rej(q.error); };
    });
    return _imgDbP;
  }
  function _imgCachePut(id, dataUrl) {
    return _imgDb().then(function (db) {
      return new Promise(function (res) { var t = db.transaction('imgs', 'readwrite'); t.objectStore('imgs').put({ id: id, dataUrl: dataUrl }); t.oncomplete = res; t.onerror = res; });
    }).catch(function () {});
  }
  function _imgCacheGet(id) {
    return _imgDb().then(function (db) {
      return new Promise(function (res) { var g = db.transaction('imgs', 'readonly').objectStore('imgs').get(id); g.onsuccess = function () { res(g.result && g.result.dataUrl || null); }; g.onerror = function () { res(null); }; });
    }).catch(function () { return null; });
  }

  var _fsimgBusy = false;                       // המרה אחת בכל רגע (rebuild באמצע לא מכפיל)
  function convertHeavyImagesToCloud(editor, save) {
    if (_fsimgBusy) return;
    if (!(window.CloudFiles && CloudFiles.enabled && CloudFiles.enabled())) return;
    var size = new Blob([editor.innerHTML]).size;
    if (size <= IMG_CONVERT_WHEN) return;
    // תמונות base64 שעדיין לא בענן, גדולה-תחילה
    var imgs = Array.prototype.slice.call(editor.querySelectorAll('img'))
      .filter(function (im) { return !im.getAttribute('data-fsimg') && (im.getAttribute('src') || '').indexOf('data:image') === 0 && im.getAttribute('src').length > 30 * 1024; })
      .sort(function (a, b) { return b.getAttribute('src').length - a.getAttribute('src').length; });
    if (!imgs.length) return;
    _fsimgBusy = true;
    (async function () {
      var moved = 0;
      try {
        for (var i = 0; i < imgs.length && size > IMG_CONVERT_TARGET; i++) {
          var im = imgs[i];
          if (!im.isConnected) continue;
          var src = im.getAttribute('src');
          try {
            var blob = await (await fetch(src)).blob();
            if (!CloudFiles.fits(blob.size)) continue;
            var id = 'img' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            var ext = (blob.type.split('/')[1] || 'png').split('+')[0];
            await CloudFiles.upload(new File([blob], 'note-image.' + ext, { type: blob.type }), id, null);
            await _imgCachePut(id, src);              // מכשיר-המקור ממשיך לראות גם offline
            if (!im.isConnected) continue;            // העורך התחלף בזמן ההעלאה — הפתיחה הבאה תמיר
            im.setAttribute('data-fsimg', id);        // ה-src בתצוגה נשאר מלא; getCleanHTML מפשיט בשמירה
            size -= src.length;                       // הערכת הגודל אחרי ההפשטה
            moved++;
            save();
          } catch (e) {
            console.warn('[media] image→cloud failed:', e && e.message);
          }
        }
      } finally { _fsimgBusy = false; }
      if (moved && window.App) App.toast('☁️ ' + moved + ' תמונות כבדות הועברו לענן — הפתק יסתנכרן מלא לכל המכשירים');
    })();
  }

  // הזרקת src לתמונות-ענן (data-fsimg) שה-src שלהן הוא placeholder — מהמטמון
  // או מהענן. רץ בכל בניית-עורך ואחרי undo/redo.
  var _hydrating = Object.create(null);
  function hydrateCloudImages(editor) {
    var imgs = Array.prototype.slice.call(editor.querySelectorAll('img[data-fsimg]'))
      .filter(function (im) { return (im.getAttribute('src') || '').length < 300; });   // placeholder בלבד
    imgs.forEach(function (im) {
      var id = im.getAttribute('data-fsimg');
      if (!id || _hydrating[id]) return;
      _hydrating[id] = true;
      _imgCacheGet(id).then(function (cached) {
        if (cached) return cached;
        if (!(window.CloudFiles && CloudFiles.enabled && CloudFiles.enabled())) return null;
        return CloudFiles.fetch(id).then(function (f) { _imgCachePut(id, f.dataUrl); return f.dataUrl; });
      }).then(function (dataUrl) {
        if (dataUrl && im.isConnected) im.setAttribute('src', dataUrl);
        else if (!dataUrl && im.isConnected) im.title = 'תמונה בענן — התחבר לאינטרנט/לחשבון כדי לראות אותה';
      }).catch(function (e) {
        console.warn('[media] image hydrate failed:', id, e && e.message);
        if (im.isConnected) im.title = 'טעינת התמונה מהענן נכשלה — ינוסה בפתיחה הבאה';
      }).finally(function () { delete _hydrating[id]; });
    });
  }

  // ── ייבוא Word לפתק — כולל התמונות (P-12, 15.7.2026) ─────────────────────
  // הפתרון האמיתי ל"העתקה מוורד מאבדת תמונות": וורד לא מוסר את ביטי-התמונות
  // ללוח-ההעתקה (רק הפניות file:/// שדפדפן חסום מלקרוא) — אי אפשר לתקן דרך
  // paste. במקום זה מייבאים את קובץ ה-docx עצמו: mammoth.js (כבר vendored,
  // deferred ב-index.html) ממיר ל-HTML עם התמונות כ-base64, וההזרקה עוברת
  // דרך צינור-ההדבקה הרגיל (ניקוי, דחיסה, עטיפת-figures) — כאילו הודבק מושלם.
  // תמיכה בשלושה פורמטים, מזוהים לפי חתימת-הבייטים (לא לפי הסיומת — קבצי ‎.doc
  // רבים הם בעצם docx או MHTML במסווה):
  //   PK..           → docx (מנוע mammoth)
  //   "MIME-Ver"     → MHTML — ‏"Web Archive" ‏(כולל קובצי הייצוא-ל-Word של
  //                    המחברת עצמה!) — מפוענח כאן: HTML ‏(quoted-printable) +
  //                    תמונות base64 לפי Content-Location
  //   D0 CF 11 E0    → ‎.doc בינארי ישן אמיתי — אין מנוע בדפדפן; הודעה ברורה
  function _qpDecodeToUtf8(qp) {
    qp = qp.replace(/=\r?\n/g, '');
    var bytes = [];
    for (var i = 0; i < qp.length; i++) {
      var ch = qp.charAt(i);
      if (ch === '=' && /^[0-9A-Fa-f]{2}$/.test(qp.substr(i + 1, 2))) {
        bytes.push(parseInt(qp.substr(i + 1, 2), 16)); i += 2;
      } else bytes.push(ch.charCodeAt(0) & 0xFF);
    }
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  }

  function _mhtmlToHtml(text) {
    var bm = text.match(/boundary="([^"]+)"/);
    if (!bm) throw new Error('MHTML בלי boundary — קובץ פגום');
    var parts = text.split('--' + bm[1]);
    var html = null;
    var images = [];   // { loc, dataUrl }
    for (var i = 1; i < parts.length; i++) {
      var sep = parts[i].indexOf('\r\n\r\n');
      if (sep === -1) sep = parts[i].indexOf('\n\n');
      if (sep === -1) continue;
      var hdr = parts[i].slice(0, sep);
      var body = parts[i].slice(sep).replace(/^\r?\n\r?\n?/, '');
      var type = (hdr.match(/Content-Type:\s*([^;\r\n]+)/i) || [])[1] || '';
      var loc = (hdr.match(/Content-Location:\s*([^\r\n]+)/i) || [])[1] || '';
      var enc = ((hdr.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i) || [])[1] || '').trim().toLowerCase();
      if (/text\/html/i.test(type) && html === null) {
        html = enc === 'quoted-printable' ? _qpDecodeToUtf8(body) : body;
      } else if (/^image\//i.test(type) && loc) {
        images.push({ loc: loc.trim(), dataUrl: 'data:' + type.trim() + ';base64,' + body.replace(/[\r\n\s]/g, '') });
      }
    }
    if (!html) throw new Error('לא נמצא תוכן HTML בקובץ');
    // גוף בלבד (בלי head/style/title שיהפכו לטקסט גלוי)
    var bodyM = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyM) html = bodyM[1];
    // החלפת ההפניות ב-data-URIs. ⚠️ ה-HTML מפנה לתמונות בשלוש צורות אפשריות:
    // המיקום המלא (file:///C:/imageNNN.webp), או — כמו בקובצי-הייצוא של המחברת
    // עצמה — **שם-קובץ יחסי בלבד** (src="image001.webp"). מחליפים את כולן,
    // בעיגון לתכונת src כדי לא לגעת בטקסט חופשי.
    images.forEach(function (im) {
      var base = im.loc.split('/').pop();
      html = html.split(im.loc).join(im.dataUrl);
      if (base && base !== im.loc) {
        html = html.split('file:///C:/' + base).join(im.dataUrl);
        html = html.split('src="' + base + '"').join('src="' + im.dataUrl + '"');
        html = html.split("src='" + base + "'").join("src='" + im.dataUrl + "'");
      }
    });
    return html;
  }

  function importDocxInline(file, editor, save) {
    if (!file) return;
    if (window.App) App.toast('מייבא את ' + file.name + '…');
    file.slice(0, 8).arrayBuffer().then(function (headBuf) {
      var b = new Uint8Array(headBuf);
      var isZip = b[0] === 0x50 && b[1] === 0x4B;                                   // PK → docx
      var isOle = b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0; // doc ישן
      var headTxt = new TextDecoder('utf-8').decode(b);
      var isMht = headTxt.indexOf('MIME-Ver') === 0;

      if (isZip) {
        if (!window.mammoth || !mammoth.convertToHtml) throw new Error('מנוע ההמרה עדיין נטען — נסה שוב בעוד רגע');
        return file.arrayBuffer()
          .then(function (ab) { return mammoth.convertToHtml({ arrayBuffer: ab }); })
          .then(function (result) { return result && result.value || ''; });
      }
      if (isMht) return file.text().then(_mhtmlToHtml);
      if (isOle) throw new Error('זהו קובץ Word בפורמט הישן (בינארי) — פתח אותו בוורד ושמור-בשם ‎.docx, ואז ייבא');
      throw new Error('הקובץ אינו docx / Word-MHTML — פתח בוורד ושמור-בשם ‎.docx');
    }).then(function (html) {
      if (!html || !html.trim()) throw new Error('הקובץ ריק או לא ניתן להמרה');
      var imgCount = (html.match(/<img /g) || []).length;
      return window.EditableImage.insertHtmlWithImages(html, editor, save).then(function () {
        if (window.App) App.toast('📥 ' + file.name + ' יובא לפתק' + (imgCount ? ' — כולל ' + imgCount + ' תמונות' : ''));
        // ייבוא כבד עלול להקפיץ את הגוף מעל סף-הסנכרון — מנתבים תמונות לענן מיד
        setTimeout(function () { convertHeavyImagesToCloud(editor, save); }, 800);
      });
    }).catch(function (e) {
      console.warn('[media] word import failed:', e);
      if (window.App) App.toast('הייבוא נכשל: ' + (e && e.message || ''));
    });
  }

  window.nbMedia = {
    insertImage: function (dataUrl, editor, save) { return window.Editable.insertImage(dataUrl, editor, save); },
    restoreMoodBlocks: restoreMoodBlocks, attachMoodBehaviors: attachMoodBehaviors,
    insertImageFile: function (file, editor, save) { return window.Editable.insertImageFromFile(file, editor, save); },
    attachTableResizers: attachTableResizers, wrapImagesInEditor: wrapImagesInEditor,
    startImageResize: startImageResize, openAttachment: openAttachment, downloadAttachment: downloadAttachment,
    insertFileAttachment: insertFileAttachment, upgradeLocalAttachments: upgradeLocalAttachments,
    importDocxInline: importDocxInline,
    convertHeavyImagesToCloud: convertHeavyImagesToCloud, hydrateCloudImages: hydrateCloudImages,
    FSIMG_PLACEHOLDER: FSIMG_PLACEHOLDER, _fmtSize: _fmtSize
  };
})();