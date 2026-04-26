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

  function insertImage(dataUrl, editor, save) {
    editor.focus();
    const fig = document.createElement('figure');
    fig.className = 'nb-img';
    fig.contentEditable = 'false';
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = '';
    fig.appendChild(img);

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
        return;
      }

      // Click on figure cycles alignment: none → start → end → center → none
      const ALIGN = ['', 'align-start', 'align-end', 'align-center'];
      const fig = e.target.closest && e.target.closest('figure.nb-img');
      if (!fig || !editor.contains(fig)) return;
      e.preventDefault();
      const cur = ALIGN.findIndex(c => c && fig.classList.contains(c));
      const nextIdx = cur === -1 ? 1 : (cur + 1) % ALIGN.length;
      ALIGN.forEach(c => c && fig.classList.remove(c));
      if (ALIGN[nextIdx]) fig.classList.add(ALIGN[nextIdx]);
      save && save();
      const labels = { '': 'ללא יישור', 'align-start': 'צמוד לימין', 'align-end': 'צמוד לשמאל', 'align-center': 'במרכז' };
      if (window.App) App.toast(labels[ALIGN[nextIdx]] || 'ללא יישור');
    });

    // Persist size after the user finishes resizing (mouse up)
    editor.addEventListener('mouseup', () => {
      // Browser-native resize updates inline styles on figure — just save.
      save && save();
    });
  }

  window.Editable = { debounce, insertImageFromFile, insertImage, attachImageBehaviors };
})();
