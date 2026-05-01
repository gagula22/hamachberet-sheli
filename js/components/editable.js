(function () {
  function debounce(fn, wait = 400) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function compressImage(dataUrl, maxW, quality) {
    maxW = maxW || 1200;
    quality = quality || 0.75;
    return new Promise(function (resolve) {
      const img = new Image();
      img.onload = function () {
        const scale = Math.min(1, maxW / img.naturalWidth);
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    });
  }

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

  // Returns the effective max image width: the smaller of A4 printable width
  // and the editor's actual content area (for narrow/mobile screens).
  function editorContentWidth(editor) {
    const cs = getComputedStyle(editor);
    const contentW = editor.clientWidth
                   - parseFloat(cs.paddingLeft  || 0)
                   - parseFloat(cs.paddingRight || 0);
    return Math.min(contentW, A4_CONTENT_W);
  }

  function insertImage(dataUrl, editor, save) {
    editor.focus();
    const fig = document.createElement('figure');
    fig.className = 'nb-img';
    fig.contentEditable = 'false';
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = '';
    fig.appendChild(img);

    // Clamp initial width to the printable content area
    const maxW = editorContentWidth(editor);
    const initW = Math.min(300, maxW);
    if (initW > 0) fig.style.width = initW + 'px';

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
    snapFigToPage(fig, editor);
    clampFigToEditor(fig, editor);
    makeFigMovable(fig, editor, save);

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
      const maxW = editorContentWidth(editor);
      if (maxW > 0 && fig.offsetWidth > maxW) {
        fig.style.width = maxW + 'px';
      }
    }).observe(fig);
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
    'font-weight','font-style','text-decoration','font-size',
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

      if (!dataUrl) { imgEl.remove(); continue; }

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
      // Set initial width if missing
      if (!fig.style.width) {
        const maxW = editorContentWidth(editor);
        fig.style.width = Math.min(300, maxW) + 'px';
      }
    });

    save && save();
    if (window.App) App.toast('התוכן הודבק ✓');
  }

  function attachImageBehaviors(editor, save) {
    // Restore behaviors for figures loaded from storage
    editor.querySelectorAll('figure.nb-img').forEach(fig => addDeleteButtonToFig(fig, save, editor));

    // ── Paste handler ─────────────────────────────────────────────────────
    editor.addEventListener('paste', async (e) => {
      const cd = e.clipboardData || window.clipboardData;
      const items = Array.from(cd?.items || []);
      const types = Array.from(cd?.types || []);

      // Priority 1: raw image file (screenshot / copy-image)
      const imgItem = items.find(it => it.type && it.type.startsWith('image/') && it.kind === 'file');
      if (imgItem) {
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
      if (types.includes('text/html')) {
        const html = cd.getData('text/html');
        if (html && html.trim()) {
          e.preventDefault();
          await pasteHtmlContent(html, items, editor, save);
          return;
        }
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

  window.Editable = { debounce, insertImageFromFile, insertImage, attachImageBehaviors };
})();
