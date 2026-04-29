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
  // If the figure crosses a 1100px page separator, insert a spacer before it
  // to push it fully onto the next page. Also re-checks after resize.
  function snapFigToPage(fig, editor) {
    const PAGE_H = 1100;
    const MIN_MARGIN = 40; // px — don't push if only a tiny overflow

    const doSnap = () => {
      // Remove any existing spacer we inserted for this figure
      const prev = fig.previousElementSibling;
      if (prev && prev.classList.contains('nb-page-spacer')) prev.remove();

      const editorTop = editor.getBoundingClientRect().top + window.scrollY
                      - editor.scrollTop;
      const figTop    = fig.getBoundingClientRect().top + window.scrollY - editorTop;
      const figH      = fig.getBoundingClientRect().height;
      const figBottom = figTop + figH;

      const pageIndex    = Math.floor(figTop / PAGE_H);
      const pageBottom   = (pageIndex + 1) * PAGE_H;

      // Figure crosses the page boundary AND it fits on the next page
      if (figBottom > pageBottom - MIN_MARGIN && figH < PAGE_H) {
        const pushPx = pageBottom - figTop + 8; // 8px buffer after separator
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
    // Snap figure height to 28px ruled-paper grid (only inside .note-body)
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
    if (fig.querySelector('.nb-img-del')) return; // already has one
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
  }

  // Attach a ResizeObserver to a figure that prevents it from ever exceeding
  // the editor's printable content width. Fires continuously while the user
  // drags the resize handle — no mouseup lag.
  function clampFigToEditor(fig, editor) {
    if (!window.ResizeObserver) return;
    new ResizeObserver(() => {
      const maxW = editorContentWidth(editor);
      if (maxW > 0 && fig.offsetWidth > maxW) {
        fig.style.width = maxW + 'px';
      }
    }).observe(fig);
  }

  function attachImageBehaviors(editor, save) {
    // Add delete button + page-snap to any existing figures (loaded from storage)
    editor.querySelectorAll('figure.nb-img').forEach(fig => addDeleteButtonToFig(fig, save, editor));
    // Paste images from clipboard
    editor.addEventListener('paste', (e) => {
      const items = (e.clipboardData || window.clipboardData)?.items || [];
      let handled = false;
      for (const item of items) {
        if (item.type && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handled = true;
            const reader = new FileReader();
            reader.onload = async () => {
              const compressed = await compressImage(String(reader.result));
              insertImage(compressed, editor, save);
              save && save();
            };
            reader.readAsDataURL(file);
          }
        }
      }
      if (handled) e.preventDefault();
    });

    // Delete button — event delegation (handles both new and loaded-from-storage figures)
    editor.addEventListener('click', (e) => {
      const delBtn = e.target.closest('.nb-img-del');
      if (delBtn && editor.contains(delBtn)) {
        e.preventDefault();
        e.stopPropagation();
        const fig = delBtn.closest('figure.nb-img');
        if (fig) { fig.remove(); save && save(); }
      }
      // Images are always centered — no alignment cycling
    });

    // Persist size after the user finishes resizing (mouse up).
    editor.addEventListener('mouseup', () => { save && save(); });
  }

  window.Editable = { debounce, insertImageFromFile, insertImage, attachImageBehaviors };
})();
