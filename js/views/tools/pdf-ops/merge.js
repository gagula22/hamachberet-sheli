(function () {
  // Merge PDF — combine several PDFs into one, in order. 100% local (pdf-lib).
  function buildPdfMerge() {
    var files = [];
    var status = window.PdfOps.statusEl();
    var list = App.el('div', { style: { marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' } });

    var goBtn = App.el('button', {
      class: 'btn',
      style: { display: 'none', marginTop: '12px', padding: '10px 20px', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontWeight: 600 },
      onClick: doMerge
    }, '🔗 מזג והורד');

    function move(i, d) {
      var j = i + d; if (j < 0 || j >= files.length) return;
      var t = files[i]; files[i] = files[j]; files[j] = t; renderList();
    }
    function renderList() {
      list.innerHTML = '';
      files.forEach(function (f, i) {
        var row = App.el('div', {
          style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px',
                   background: 'var(--cream)', padding: '6px 10px', borderRadius: 'var(--r-sm)' }
        }, [
          App.el('span', { style: { flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, (i + 1) + '. ' + f.name),
          App.el('button', { style: btnS(), title: 'למעלה', onClick: function () { move(i, -1); } }, '↑'),
          App.el('button', { style: btnS(), title: 'למטה', onClick: function () { move(i, 1); } }, '↓'),
          App.el('button', { style: btnS(), title: 'הסר', onClick: function () { files.splice(i, 1); renderList(); } }, '✕')
        ]);
        list.appendChild(row);
      });
      goBtn.style.display = files.length >= 2 ? 'inline-block' : 'none';
      window.PdfOps.setStatus(status, files.length ? files.length + ' קבצים נבחרו — מזג לפי הסדר' : '');
    }
    function btnS() { return { cursor: 'pointer', border: 'none', background: 'transparent', fontSize: '14px', color: 'var(--ink)', padding: '0 2px' }; }

    var dz = window.PdfOps.dropzone({
      multiple: true, icon: '🔗', title: 'גרור כמה קובצי PDF לכאן', sub: 'הם ימוזגו לפי הסדר · אפשר להוסיף עוד',
      onFiles: function (fl) {
        Array.from(fl).forEach(function (f) { if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) files.push(f); });
        renderList();
      }
    });

    async function doMerge() {
      if (files.length < 2) return;
      goBtn.disabled = true; var t = goBtn.textContent; goBtn.textContent = '⏳ ממזג…';
      window.PdfOps.setStatus(status, 'ממזג…');
      try {
        var PDFLib = await window.PdfOps.ensureLib();
        var out = await PDFLib.PDFDocument.create();
        for (var i = 0; i < files.length; i++) {
          var ab = await files[i].arrayBuffer();
          var src = await PDFLib.PDFDocument.load(ab, { ignoreEncryption: true });
          var copied = await out.copyPages(src, src.getPageIndices());
          copied.forEach(function (p) { out.addPage(p); });
        }
        var bytes = await out.save();
        window.PdfOps.download(bytes, 'merged.pdf');
        window.PdfOps.setStatus(status, '✓ מוזגו ' + files.length + ' קבצים — הורד merged.pdf', 'ok');
      } catch (e) {
        console.error('[pdf-merge]', e);
        window.PdfOps.setStatus(status, 'שגיאה במיזוג: ' + (e && e.message ? e.message : ''), 'err');
      } finally {
        goBtn.disabled = false; goBtn.textContent = t;
      }
    }

    return App.el('div', { class: 'card' }, [
      App.el('div', { class: 'row row-between', style: { marginBottom: '16px' } }, [
        App.el('h2', {}, '🔗  מזג PDF'),
        App.el('span', { class: 'chip lavender' }, 'אחד כמה קובצי PDF לקובץ אחד')
      ]),
      dz.input, dz.zone, list, status, goBtn,
      App.el('p', { style: { fontSize: '12px', color: 'var(--ink-mute)', margin: '10px 0 0', lineHeight: '1.6' } },
        '🔒 רץ מקומית בדפדפן — הקבצים לא עולים לשום שרת.')
    ]);
  }
  window.Tools = window.Tools || {};
  window.Tools.pdfMerge = buildPdfMerge;
})();
