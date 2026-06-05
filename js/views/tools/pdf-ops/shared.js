(function () {
  // Shared infrastructure for the LOCAL PDF page-operation tools (merge / split /
  // delete / rotate). pdf-lib is lazy-loaded from the LOCAL vendor copy on first
  // use — NO CDN, and files NEVER leave the browser. → window.PdfOps
  var _libP = null;
  function ensureLib() {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    if (_libP) return _libP;
    _libP = new Promise(function (res, rej) {
      var base = location.href.replace(/#.*/, '').replace(/index\.html.*/, '');
      var s = document.createElement('script');
      s.src = base + 'js/vendor/pdf-lib.min.js';
      s.onload = function () { window.PDFLib ? res(window.PDFLib) : rej(new Error('pdf-lib missing')); };
      s.onerror = function () { rej(new Error('pdf-lib load failed')); };
      document.head.appendChild(s);
    });
    return _libP;
  }

  var _zipP = null;
  function ensureZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (_zipP) return _zipP;
    _zipP = new Promise(function (res, rej) {
      var base = location.href.replace(/#.*/, '').replace(/index\.html.*/, '');
      var s = document.createElement('script');
      s.src = base + 'js/vendor/jszip.min.js';
      s.onload = function () { window.JSZip ? res(window.JSZip) : rej(new Error('JSZip missing')); };
      s.onerror = function () { rej(new Error('JSZip load failed')); };
      document.head.appendChild(s);
    });
    return _zipP;
  }

  function download(bytes, name, type) {
    var blob = new Blob([bytes], { type: type || 'application/pdf' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  // Standard dropzone. opts: {accept, multiple, icon, title, sub, onFiles(fileList)}
  function dropzone(opts) {
    opts = opts || {};
    var input = document.createElement('input');
    input.type = 'file'; input.accept = opts.accept || '.pdf'; input.style.display = 'none';
    if (opts.multiple) input.multiple = true;
    input.addEventListener('change', function () { if (input.files.length) opts.onFiles(input.files); input.value = ''; });
    var zone = App.el('div', {
      style: { border: '2px dashed var(--line)', borderRadius: 'var(--r-md)', padding: '32px 20px',
               textAlign: 'center', cursor: 'pointer', transition: 'all 180ms', background: 'var(--cream)' },
      onClick: function () { input.click(); }
    }, [
      App.el('div', { style: { fontSize: '40px', marginBottom: '8px' } }, opts.icon || '📄'),
      App.el('div', { style: { fontWeight: 600, marginBottom: '4px' } }, opts.title || 'גרור קובץ PDF לכאן'),
      App.el('div', { style: { fontSize: '13px', color: 'var(--ink-mute)' } }, opts.sub || 'או לחץ לבחירה · .pdf')
    ]);
    zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.style.borderColor = 'var(--lavender-deep)'; zone.style.background = 'var(--lavender)'; });
    zone.addEventListener('dragleave', function () { zone.style.borderColor = 'var(--line)'; zone.style.background = 'var(--cream)'; });
    zone.addEventListener('drop', function (e) {
      e.preventDefault(); zone.style.borderColor = 'var(--line)'; zone.style.background = 'var(--cream)';
      if (e.dataTransfer.files.length) opts.onFiles(e.dataTransfer.files);
    });
    return { zone: zone, input: input };
  }

  // Parse "1-3,5,8-10" → sorted unique 0-based indices within [1..pageCount].
  function parseRanges(str, pageCount) {
    var set = {};
    (str || '').split(',').forEach(function (part) {
      part = part.trim(); if (!part) return;
      var m = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) { var a = +m[1], b = +m[2]; if (a > b) { var t = a; a = b; b = t; } for (var i = a; i <= b; i++) if (i >= 1 && i <= pageCount) set[i - 1] = 1; }
      else { var n = +part; if (n >= 1 && n <= pageCount) set[n - 1] = 1; }
    });
    return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
  }

  // Small status <p> + helper setters used by all page-ops tools.
  function statusEl() { return App.el('p', { style: { margin: '12px 0 0', fontSize: '13px', color: 'var(--ink-mute)' } }); }
  function setStatus(el, msg, kind) {
    el.textContent = msg;
    el.style.color = kind === 'ok' ? 'var(--sage-deep)' : kind === 'err' ? '#c00' : 'var(--ink-mute)';
  }

  window.PdfOps = { ensureLib: ensureLib, ensureZip: ensureZip, download: download, dropzone: dropzone, parseRanges: parseRanges, statusEl: statusEl, setStatus: setStatus };
})();
