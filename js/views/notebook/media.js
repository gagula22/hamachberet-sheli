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

  // meta: { name, type, size, id, dataUrl? (local base64) | url?+path? (cloud) }
  function _attachHtml(meta) {
    var esc = _escAttr(meta.name);
    var isImg = (meta.type || '').startsWith('image/');
    var thumb = meta.dataUrl || meta.url || '';
    var visual = isImg && thumb ? '<img class="file-thumb" src="' + thumb + '" alt="" />'
      : '<span class="file-icon">' + _fileIcon(meta.name, meta.type) + '</span>';
    var srcAttr = meta.url
      ? 'data-url="' + _escAttr(meta.url) + '" data-path="' + _escAttr(meta.path || '') + '"'
      : 'data-content="' + (meta.dataUrl || '') + '"';
    return '<span class="file-attachment" contenteditable="false" data-att-id="' + (meta.id || '') + '" '
      + 'data-name="' + esc + '" data-type="' + _escAttr(meta.type) + '" ' + srcAttr
      + ' title="לחץ פעמיים לפתיחה / הורדה">' + visual
      + '<span class="file-name">' + esc + '</span><span class="file-size">' + _fmtSize(meta.size) + '</span>'
      + '<span class="file-hint">↗</span><button class="file-remove" title="הסר">×</button></span>&nbsp;';
  }

  function _wireAttachment(node, editor, save) {
    if (!node || node.getAttribute('data-wired')) return;
    node.setAttribute('data-wired', '1');
    node.addEventListener('dblclick', function (ev) { ev.preventDefault(); openAttachment(node); });
    var rm = node.querySelector('.file-remove');
    if (rm) rm.addEventListener('click', function (e) {
      e.stopPropagation();
      var path = node.dataset.path;
      if (path && window.CloudFiles) CloudFiles.remove(path);   // best-effort cloud delete
      node.remove(); save();
    });
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

  // Open/preview an attachment. Cloud files (data-url) open in a new tab (browser
  // previews PDF/image natively). Legacy base64 (data-content) is converted to a
  // Blob URL — a data-URI in an iframe FAILS to render for large files (the
  // "blank tab" bug); a Blob URL renders reliably and can be downloaded.
  function openAttachment(el) {
    var url = el.dataset.url;
    var name = el.dataset.name || 'file';
    var type = el.dataset.type || '';
    if (url) { var wc = window.open(url, '_blank', 'noopener'); if (!wc) _download(url, name); return; }
    var dataUrl = el.dataset.content;
    if (!dataUrl) { App.toast('תוכן הקובץ אינו זמין (ייתכן שנשמר במכשיר אחר)'); return; }
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

  // ── Insert a file attachment. Prefers Firebase Storage: the FILE goes to the
  // CLOUD and the note stores only a small URL → the note syncs fully to
  // Firestore and the file is available from every device. Falls back to a local
  // base64 embed when not signed in / Storage unavailable — the previous
  // behaviour, so nothing breaks. (Owner: P-12; cloud upload via window.CloudFiles.)
  function insertFileAttachment(file, editor, save) {
    var HARD_CAP = 50 * 1024 * 1024; // 50 MB
    if (file.size > HARD_CAP) { App.toast('הקובץ גדול מדי (מעל 50MB)'); return; }
    var id = 'att' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    if (window.CloudFiles && CloudFiles.enabled()) {
      // placeholder → upload → swap in the real (URL-based) card
      var ph = '<span class="file-attachment file-uploading" contenteditable="false" data-att-id="' + id + '">'
        + '<span class="file-icon">⏳</span><span class="file-name">' + _escAttr(file.name) + '</span>'
        + '<span class="file-size">מעלה לענן…</span></span>&nbsp;';
      editor.focus();
      document.execCommand('insertHTML', false, ph);
      CloudFiles.upload(file, id).then(function (meta) {
        meta.id = id;
        var node = editor.querySelector('.file-attachment[data-att-id="' + id + '"]');
        if (node) {
          var tmp = document.createElement('div'); tmp.innerHTML = _attachHtml(meta);
          var real = tmp.firstChild; node.replaceWith(real); _wireAttachment(real, editor, save);
        }
        save();
        App.toast('☁️ הקובץ נשמר בענן: ' + file.name);
      }).catch(function (err) {
        console.warn('[cloud-files] upload failed → local fallback', err);
        App.toast('⚠️ העלאה לענן נכשלה — נשמר מקומית');
        _embedLocalAttachment(file, editor, save, id);
      });
      return;
    }
    _embedLocalAttachment(file, editor, save, id);   // not signed in / Storage off
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
      if (real) _wireAttachment(real, editor, save);
      save();
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
  window.nbMedia = {
    insertImage: function (dataUrl, editor, save) { return window.Editable.insertImage(dataUrl, editor, save); },
    restoreMoodBlocks: restoreMoodBlocks, attachMoodBehaviors: attachMoodBehaviors,
    insertImageFile: function (file, editor, save) { return window.Editable.insertImageFromFile(file, editor, save); },
    attachTableResizers: attachTableResizers, wrapImagesInEditor: wrapImagesInEditor,
    startImageResize: startImageResize, openAttachment: openAttachment, insertFileAttachment: insertFileAttachment, _fmtSize: _fmtSize
  };
})();