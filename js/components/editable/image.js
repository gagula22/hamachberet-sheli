(function () {
  // Image & screenshot subsystem: paste (screenshot/copy-image + Word HTML),
  // insertion, figures, snap-to-grid/page, resize-clamp, drag-to-reposition.
  var compressImage = window.EditableUtils.compressImage;
  function insertImageFromFile(file, editor, save) {
    if (!file || !file.type || !file.type.startsWith('image/')) return;
    if (file.size > 20 * 1024 * 1024) {
      if (window.App) App.toast('התמונה גדולה מדי (מעל 20MB)');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const compressed = await compressImage(String(reader.result));
      insertImage(compressed, editor, save);
      save && save();
    };
    reader.readAsDataURL(file);
  }

  // A4 printable width: 210mm − 2×25.4mm margins ≈ 602px at 96 DPI → rounded to 600.
  const A4_CONTENT_W = 600;
  // Hard maximum width for ANY image in the notebook: the A4 printable content
  // width used by the PDF/print pipeline (html-to-pdf HOST_W = 680). An image
  // must never display, store, or print wider than this — so it always fits A4.
  const A4_PRINT_W = 680;

  // Returns the editor's full content width (where the text flows), so a
  // full-width image spans the whole page exactly like the text — not just the
  // narrower A4 sub-width. A4_CONTENT_W is only a fallback when unmeasured.
  function editorContentWidth(editor) {
    const cs = getComputedStyle(editor);
    const contentW = editor.clientWidth
                   - parseFloat(cs.paddingLeft  || 0)
                   - parseFloat(cs.paddingRight || 0);
    return contentW > 0 ? contentW : A4_CONTENT_W;
  }

  function insertImage(dataUrl, editor, save) {
    editor._pushUndo?.();   // snapshot before insert — makes insert undoable
    editor.focus();
    const fig = document.createElement('figure');
    fig.className = 'nb-img';
    fig.contentEditable = 'false';
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = '';
    fig.appendChild(img);

    // Width policy: an image must NEVER exceed the A4 printable width (so it fits
    // on a printed page), and must NEVER be upscaled beyond its own pixels (which
    // caused blur). Display width = min(A4 printable width, natural width).
    fig.style.width = A4_PRINT_W + 'px';   // provisional cap; refined once loaded
    img.addEventListener('load', function () {
      const nat = img.naturalWidth || 0;
      fig.style.width = (nat > 0 ? Math.min(A4_PRINT_W, nat) : A4_PRINT_W) + 'px';
      clampFigToEditor(fig, editor);
      save && save();
    }, { once: true });

    const delBtn = document.createElement('button');
    delBtn.className = 'nb-img-del';
    delBtn.title = 'מחק תמונה';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      editor._pushUndo?.();  // snapshot before delete — makes delete undoable
      fig.remove();
      save && save();
    });
    fig.appendChild(delBtn);
    snapFigToGrid(fig);
    snapFigToPage(fig, editor);
    clampFigToEditor(fig, editor);
    makeFigMovable(fig, editor, save);
    addResizeHandles(fig, editor, save);

    const sel = window.getSelection();
    if (sel && sel.rangeCount && editor.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(fig);
      const space = document.createTextNode(' ');
      fig.after(space);
      const r2 = document.createRange();
      r2.setStartAfter(space);
      r2.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r2);
    } else {
      editor.appendChild(fig);
      editor.appendChild(document.createTextNode(' '));
    }
  }

  // After inserting a figure, ensure it doesn't straddle a page boundary.
  function snapFigToPage(fig, editor) {
    const PAGE_H = 1100;
    const MIN_MARGIN = 40;

    const doSnap = () => {
      const prev = fig.previousElementSibling;
      if (prev && prev.classList.contains('nb-page-spacer')) prev.remove();

      const editorTop = editor.getBoundingClientRect().top + window.scrollY
                      - editor.scrollTop;
      const figTop    = fig.getBoundingClientRect().top + window.scrollY - editorTop;
      const figH      = fig.getBoundingClientRect().height;
      const figBottom = figTop + figH;

      const pageIndex    = Math.floor(figTop / PAGE_H);
      const pageBottom   = (pageIndex + 1) * PAGE_H;

      if (figBottom > pageBottom - MIN_MARGIN && figH < PAGE_H) {
        const pushPx = pageBottom - figTop + 8;
        const spacer = document.createElement('div');
        spacer.className = 'nb-page-spacer';
        spacer.style.cssText = `display:block;height:${pushPx}px;line-height:0;`;
        fig.before(spacer);
      }
    };

    const img = fig.querySelector('img');
    if (img) {
      if (img.complete && img.naturalHeight > 0) requestAnimationFrame(doSnap);
      else img.addEventListener('load', () => requestAnimationFrame(doSnap));
    }
    if (window.ResizeObserver) new ResizeObserver(() => requestAnimationFrame(doSnap)).observe(fig);
  }

  function snapFigToGrid(fig) {
    if (!fig.closest('.note-body')) return;
    const LINE = 28;
    const snap = () => {
      fig.style.paddingBottom = '0';
      const h = fig.offsetHeight;
      if (!h) return;
      const rem = h % LINE;
      fig.style.paddingBottom = rem ? (LINE - rem) + 'px' : '0';
    };
    const img = fig.querySelector('img');
    if (img) {
      if (img.complete && img.naturalHeight > 0) snap();
      else img.addEventListener('load', snap);
    }
    if (window.ResizeObserver) new ResizeObserver(snap).observe(fig);
  }

  function addDeleteButtonToFig(fig, save, editor) {
    if (fig.querySelector('.nb-img-del')) return;
    const delBtn = document.createElement('button');
    delBtn.className = 'nb-img-del';
    delBtn.title = 'מחק תמונה';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fig.remove();
      save && save();
    });
    fig.appendChild(delBtn);
    snapFigToGrid(fig);
    if (editor) snapFigToPage(fig, editor);
    if (editor) clampFigToEditor(fig, editor);
    if (editor) makeFigMovable(fig, editor, save);
  }

  // Attach a ResizeObserver to a figure that prevents it from ever exceeding
  // the editor's printable content width.
  function clampFigToEditor(fig, editor) {
    if (!window.ResizeObserver) return;
    new ResizeObserver(() => {
      const ew = editorContentWidth(editor);
      const cap = Math.min(ew > 0 ? ew : A4_PRINT_W, A4_PRINT_W);
      if (cap > 0 && fig.offsetWidth > cap) {
        fig.style.width = cap + 'px';
      }
    }).observe(fig);
  }

  // Fix EXISTING images that were saved stretched wider than their real pixels
  // (the old behavior). Shrinks an upscaled figure back to its natural width so
  // it looks sharp — but never enlarges a figure the user intentionally made small.
  function unstretchFig(fig, editor, save) {
    const img = fig.querySelector('img');
    if (!img) return;
    const apply = function () {
      const nat = img.naturalWidth || 0;
      const cap = A4_PRINT_W; // ceiling only — allow user-enlarged images up to A4
      if (fig.offsetWidth > cap + 1) {
        fig.style.width = cap + 'px';
        if (editor) clampFigToEditor(fig, editor);
        save && save();
      }
    };
    if (img.complete && img.naturalHeight > 0) apply();
    else img.addEventListener('load', apply, { once: true });
  }

  // ── Manual resize handles (drag a bottom corner). Hard ceiling = A4 (680px). ──
  function addResizeHandles(fig, editor, save) {
    if (!fig || fig.dataset.rz) return;
    fig.dataset.rz = '1';
    [['nb-rz-br', 1], ['nb-rz-bl', -1]].forEach(function (pair) {
      var cls = pair[0], sign = pair[1];
      var h = document.createElement('div');
      h.className = 'nb-img-rz ' + cls;
      h.contentEditable = 'false';
      h.setAttribute('draggable', 'false');
      var startX = 0, startW = 0, active = false, pid = null;
      h.addEventListener('pointerdown', function (e) {
        e.preventDefault(); e.stopPropagation();
        active = true; pid = e.pointerId;
        startX = e.clientX; startW = fig.offsetWidth;
        fig.draggable = false;                 // don't start a move-drag while resizing
        try { h.setPointerCapture(pid); } catch (_) {}
        if (editor && editor._pushUndo) editor._pushUndo();
      });
      h.addEventListener('pointermove', function (e) {
        if (!active) return;
        var dx = (e.clientX - startX) * sign;  // outward drag = wider
        var ew = editorContentWidth(editor);
        var cap = Math.min(ew > 0 ? ew : A4_PRINT_W, A4_PRINT_W);  // never exceed A4
        var w = Math.max(60, Math.min(cap, startW + dx * 2));
        fig.style.width = Math.round(w) + 'px';
      });
      function end() {
        if (!active) return;
        active = false;
        fig.draggable = true;
        try { h.releasePointerCapture(pid); } catch (_) {}
        save && save();
      }
      h.addEventListener('pointerup', end);
      h.addEventListener('pointercancel', end);
    });
  }

  // ── Image drag-to-reposition ──────────────────────────────────────────────
  let _draggedFig = null;
  let _dropIndicator = null;

  function _cleanDropIndicator() {
    if (_dropIndicator) { _dropIndicator.remove(); _dropIndicator = null; }
  }

  function _ensureDropIndicator() {
    if (!_dropIndicator) {
      _dropIndicator = document.createElement('div');
      _dropIndicator.className = 'nb-drop-line';
      _dropIndicator.contentEditable = 'false';
    }
    return _dropIndicator;
  }

  function _getDropAnchor(editor, clientY) {
    const children = Array.from(editor.children).filter(c => c !== _draggedFig && c !== _dropIndicator);
    for (const child of children) {
      const rect = child.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return child;
    }
    return null;
  }

  function makeFigMovable(fig, editor, save) {
    if (fig.dataset.movable) return;
    fig.dataset.movable = '1';
    fig.setAttribute('draggable', 'true');

    // Add move handle icon (shown on hover)
    if (!fig.querySelector('.nb-img-move')) {
      const handle = document.createElement('div');
      handle.className = 'nb-img-move';
      handle.title = 'גרור להזזה';
      handle.textContent = '⠿';
      fig.insertBefore(handle, fig.firstChild);
    }

    fig.addEventListener('dragstart', (e) => {
      _draggedFig = fig;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', '');
      setTimeout(() => fig.classList.add('nb-img-dragging'), 0);
    });

    fig.addEventListener('dragend', () => {
      fig.classList.remove('nb-img-dragging');
      _cleanDropIndicator();
      _draggedFig = null;
    });
  }

  // ── Word / rich-text HTML paste ───────────────────────────────────────────
  const ALLOWED_STYLE_PROPS = [
    'font-weight','font-style','text-decoration',
    'font-family','color','background-color','text-align','direction'
  ];

  function cleanWordHtml(html) {
    // Strip Word conditional comments and namespace tags
    html = html
      .replace(/<!--\[if[^>]*>[\s\S]*?<!\[endif\]-->/gi, '')
      .replace(/<\?xml[^>]*>/gi, '')
      .replace(/<\/?(o|w|m|v):[^>]*>/gi, '');

    const tmp = document.createElement('div');
    tmp.innerHTML = html;

    // Remove non-content tags
    tmp.querySelectorAll('script,style,meta,link,head').forEach(el => el.remove());

    // Clean every element
    tmp.querySelectorAll('*').forEach(el => {
      const tag = el.tagName;

      // Strip noisy attributes
      el.removeAttribute('class');
      el.removeAttribute('id');
      el.removeAttribute('lang');
      el.removeAttribute('xmlns');
      el.removeAttribute('data-contrast');
      el.removeAttribute('data-ccp-props');

      // Clean inline styles — keep only human-readable props
      if (el.style && el.style.cssText) {
        const kept = [];
        ALLOWED_STYLE_PROPS.forEach(prop => {
          const val = el.style.getPropertyValue(prop);
          if (val && val !== 'normal' && val !== 'auto') kept.push(`${prop}:${val}`);
        });
        if (kept.length) el.style.cssText = kept.join(';');
        else el.removeAttribute('style');
      }

      // Preserve only needed attributes per tag
      if (tag === 'A') {
        const href = el.getAttribute('href');
        while (el.attributes.length) el.removeAttributeNode(el.attributes[0]);
        if (href) el.setAttribute('href', href);
      } else if (tag === 'IMG') {
        const src = el.getAttribute('src');
        const alt = el.getAttribute('alt') || '';
        while (el.attributes.length) el.removeAttributeNode(el.attributes[0]);
        if (src) el.setAttribute('src', src);
        el.setAttribute('alt', alt);
      } else if (tag !== 'TD' && tag !== 'TH') {
        Array.from(el.attributes).forEach(a => {
          if (a.name !== 'style') el.removeAttributeNode(a);
        });
      }
    });

    // Unwrap style-free spans
    tmp.querySelectorAll('span').forEach(span => {
      if (!span.getAttribute('style')) span.replaceWith(...span.childNodes);
    });

    return tmp.innerHTML;
  }

  async function pasteHtmlContent(html, clipboardItems, editor, save) {
    // Show loading feedback for large pastes
    if (window.App) App.toast('מעבד תוכן…');

    const cleaned = cleanWordHtml(html);
    const tmp = document.createElement('div');
    tmp.innerHTML = cleaned;

    // Collect image blobs from clipboard (Word embeds images as separate items)
    const imgBlobs = [];
    for (const item of clipboardItems) {
      if (item.type && item.type.startsWith('image/') && item.kind === 'file') {
        const file = item.getAsFile();
        if (file) imgBlobs.push(file);
      }
    }

    // Process every <img> in the pasted HTML
    const imgEls = Array.from(tmp.querySelectorAll('img'));
    let blobIdx = 0;
    let missing = 0;

    for (const imgEl of imgEls) {
      const src = imgEl.getAttribute('src') || '';
      let dataUrl = null;

      try {
        if (src.startsWith('data:image')) {
          // Already base64 — compress only
          dataUrl = await compressImage(src);

        } else if (src.startsWith('blob:')) {
          // Blob URL — fetch → data URL
          const resp = await fetch(src);
          const blob = await resp.blob();
          dataUrl = await new Promise((res, rej) => {
            const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej;
            r.readAsDataURL(blob);
          });
          dataUrl = await compressImage(dataUrl);

        } else if (imgBlobs.length > blobIdx) {
          // file:// or relative path — use matching clipboard blob
          const file = imgBlobs[blobIdx++];
          dataUrl = await new Promise((res, rej) => {
            const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej;
            r.readAsDataURL(file);
          });
          dataUrl = await compressImage(dataUrl);

        } else if (src.startsWith('http://') || src.startsWith('https://')) {
          // External URL — try to load via canvas (may fail cross-origin)
          dataUrl = await compressImage(src).catch(() => src);
        }
      } catch { /* skip broken image */ }

      if (!dataUrl) {
        // Unrecoverable image (Word references a local file:// path the browser
        // is not allowed to read, and no matching clipboard bitmap was found).
        // ⚠️ Never remove silently — that read as "the notebook loses my
        // images". Leave a visible placeholder the user can act on or delete.
        missing++;
        const ph = document.createElement('figure');
        ph.className = 'nb-img nb-img-missing';
        ph.contentEditable = 'false';
        ph.style.width = '420px';
        ph.innerHTML =
          '<div style="border:2px dashed #C9B48F;border-radius:10px;background:#FAF6EC;' +
          'padding:18px 14px;text-align:center;color:#6B5840;font-size:13px;line-height:1.7">' +
          '🖼️ <b>תמונה שלא הועברה בהעתקה</b><br>' +
          '<span style="font-size:12px;color:#8a7a62">חזור למקור, לחץ על התמונה עצמה לחיצה ימנית ← ' +
          '"העתק תמונה", והדבק אותה כאן במקום התיבה הזו</span></div>';
        imgEl.replaceWith(ph);
        continue;
      }

      imgEl.setAttribute('src', dataUrl);

      // Wrap in figure.nb-img if not already inside one
      if (imgEl.parentNode && tmp.contains(imgEl) && !imgEl.closest('figure.nb-img')) {
        const fig = document.createElement('figure');
        fig.className = 'nb-img';
        fig.contentEditable = 'false';
        imgEl.after(fig);
        fig.appendChild(imgEl);
      }
    }

    // Insert cleaned content at cursor
    editor.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount && editor.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const frag = document.createDocumentFragment();
      Array.from(tmp.childNodes).forEach(n => frag.appendChild(n));
      range.insertNode(frag);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      Array.from(tmp.childNodes).forEach(n => editor.appendChild(n));
    }

    // Attach behaviors to all freshly inserted figures
    editor.querySelectorAll('figure.nb-img').forEach(fig => {
      if (!fig.querySelector('.nb-img-del')) addDeleteButtonToFig(fig, save, editor);
      else {
        makeFigMovable(fig, editor, save);
        clampFigToEditor(fig, editor);
      }
      // Initial width capped to A4 printable width, then refined to
      // min(A4, natural) and clamped once the image has loaded.
      if (!fig.style.width) fig.style.width = A4_PRINT_W + 'px';
      unstretchFig(fig, editor, save);
      addResizeHandles(fig, editor, save);
    });

    save && save();
    if (window.App) {
      if (missing) App.toast('⚠️ הודבק, אבל ' + missing + ' תמונות לא הועברו מהמקור — ראה את התיבות המסומנות');
      else App.toast('התוכן הודבק ✓');
    }
  }

  function attachImageBehaviors(editor, save) {
    // Restore behaviors for figures loaded from storage
    editor.querySelectorAll('figure.nb-img').forEach(fig => { addDeleteButtonToFig(fig, save, editor); unstretchFig(fig, editor, save); addResizeHandles(fig, editor, save); });

    // ── Paste handler ─────────────────────────────────────────────────────
    editor.addEventListener('paste', async (e) => {
      const cd = e.clipboardData || window.clipboardData;
      const items = Array.from(cd?.items || []);
      const types = Array.from(cd?.types || []);
      const html = types.includes('text/html') ? cd.getData('text/html') : '';

      // Does the clipboard HTML carry real content beyond a single image?
      // (select-all copy from Word / Docs / a web page.) Word puts BOTH rich
      // HTML and a bitmap item on the clipboard — ⚠️ taking the raw image
      // first used to discard ALL the text and the remaining images ("pastes
      // only part of what I copied"). Rich HTML must win; the raw-image
      // branch is only for pure image pastes (screenshot / copy-image).
      let richHtml = false;
      if (html && html.trim()) {
        const probe = document.createElement('div');
        probe.innerHTML = html;
        probe.querySelectorAll('script,style,meta,link,head').forEach(el => el.remove());
        const textLen = (probe.textContent || '').trim().length;
        const imgCount = probe.querySelectorAll('img').length;
        richHtml = textLen > 0 || imgCount > 1;
      }

      // Priority 1: raw image file (screenshot / copy-image) — only when the
      // clipboard is essentially just that image
      const imgItem = items.find(it => it.type && it.type.startsWith('image/') && it.kind === 'file');
      if (imgItem && !richHtml) {
        const file = imgItem.getAsFile();
        if (file) {
          e.preventDefault();
          const reader = new FileReader();
          reader.onload = async () => {
            const compressed = await compressImage(String(reader.result));
            insertImage(compressed, editor, save);
            save && save();
          };
          reader.readAsDataURL(file);
          return;
        }
      }

      // Priority 2: rich HTML (Word / Google Docs / any formatted paste)
      if (richHtml) {
        e.preventDefault();
        await pasteHtmlContent(html, items, editor, save);
        return;
      }

      // Priority 3: plain text — let browser handle natively
    });

    // ── Delete button (event delegation) ─────────────────────────────────
    editor.addEventListener('click', (e) => {
      const delBtn = e.target.closest('.nb-img-del');
      if (delBtn && editor.contains(delBtn)) {
        e.preventDefault();
        e.stopPropagation();
        const fig = delBtn.closest('figure.nb-img');
        if (fig) { fig.remove(); save && save(); }
      }
    });

    // ── Image drag-to-reposition ──────────────────────────────────────────
    editor.addEventListener('dragover', (e) => {
      if (!_draggedFig || !editor.contains(_draggedFig)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const ind = _ensureDropIndicator();
      const anchor = _getDropAnchor(editor, e.clientY);
      if (anchor) anchor.before(ind);
      else editor.appendChild(ind);
    });

    editor.addEventListener('dragleave', (e) => {
      if (!editor.contains(e.relatedTarget)) _cleanDropIndicator();
    });

    editor.addEventListener('drop', (e) => {
      if (!_draggedFig || !editor.contains(_draggedFig)) return;
      e.preventDefault();
      editor._pushUndo?.();  // snapshot before move — makes move undoable
      if (_dropIndicator && _dropIndicator.parentNode) {
        _dropIndicator.replaceWith(_draggedFig);
      } else {
        editor.appendChild(_draggedFig);
      }
      _dropIndicator = null;
      _draggedFig = null;
      save && save();
    });

    // ── Persist size after the user finishes resizing ─────────────────────
    editor.addEventListener('mouseup', () => { save && save(); });
  }
  window.EditableImage = { insertImageFromFile: insertImageFromFile, insertImage: insertImage, attachImageBehaviors: attachImageBehaviors };
})();