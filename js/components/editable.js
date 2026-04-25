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
      insertImage(compressed, editor);
      save && save();
    };
    reader.readAsDataURL(file);
  }

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

  function attachImageBehaviors(editor, save) {
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
              insertImage(compressed, editor);
              save && save();
            };
            reader.readAsDataURL(file);
          }
        }
      }
      if (handled) e.preventDefault();
    });

    // Click on figure cycles alignment: none → start → end → center → none
    const ALIGN = ['', 'align-start', 'align-end', 'align-center'];
    editor.addEventListener('click', (e) => {
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
