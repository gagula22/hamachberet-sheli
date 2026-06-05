(function () {
  // Images → PDF — combine JPG/PNG images into a PDF (one image per page). Local (pdf-lib).
  function buildImgToPdf() {
    var files = [];
    var status = window.PdfOps.statusEl();
    var list = App.el('div', { style: { marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' } });
    var goBtn = App.el('button', { class: 'btn', style: { display: 'none', marginTop: '12px', padding: '10px 20px', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontWeight: 600 }, onClick: doConvert }, '📄 צור PDF והורד');

    function move(i, d) { var j = i + d; if (j < 0 || j >= files.length) return; var t = files[i]; files[i] = files[j]; files[j] = t; renderList(); }
    function renderList() {
      list.innerHTML = '';
      files.forEach(function (f, i) {
        var row = App.el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', background: 'var(--cream)', padding: '6px 10px', borderRadius: 'var(--r-sm)' } }, [
          App.el('span', { style: { flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, (i + 1) + '. ' + f.name),
          App.el('button', { style: bs(), title: 'למעלה', onClick: function () { move(i, -1); } }, '↑'),
          App.el('button', { style: bs(), title: 'למטה', onClick: function () { move(i, 1); } }, '↓'),
          App.el('button', { style: bs(), title: 'הסר', onClick: function () { files.splice(i, 1); renderList(); } }, '✕')
        ]);
        list.appendChild(row);
      });
      goBtn.style.display = files.length ? 'inline-block' : 'none';
      window.PdfOps.setStatus(status, files.length ? files.length + ' תמונות נבחרו — תמונה לעמוד' : '');
    }
    function bs() { return { cursor: 'pointer', border: 'none', background: 'transparent', fontSize: '14px', color: 'var(--ink)', padding: '0 2px' }; }

    var dz = window.PdfOps.dropzone({ multiple: true, accept: 'image/jpeg,image/png', icon: '📄', title: 'גרור תמונות JPG/PNG לכאן', sub: 'כל תמונה תהפוך לעמוד · אפשר כמה',
      onFiles: function (fl) { Array.from(fl).forEach(function (f) { if (/^image\/(jpe?g|png)$/.test(f.type) || /\.(jpe?g|png)$/i.test(f.name)) files.push(f); }); renderList(); } });

    async function doConvert() {
      if (!files.length) return;
      goBtn.disabled = true; var t = goBtn.textContent; goBtn.textContent = '⏳ יוצר…';
      try {
        var PDFLib = await window.PdfOps.ensureLib();
        var doc = await PDFLib.PDFDocument.create();
        for (var i = 0; i < files.length; i++) {
          var f = files[i]; var ab = await f.arrayBuffer();
          var isPng = /\.png$/i.test(f.name) || f.type === 'image/png';
          var img = isPng ? await doc.embedPng(ab) : await doc.embedJpg(ab);
          var p = doc.addPage([img.width, img.height]);
          p.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
        }
        window.PdfOps.download(await doc.save(), 'images.pdf');
        window.PdfOps.setStatus(status, '✓ נוצר PDF עם ' + files.length + ' עמודים — הורד images.pdf', 'ok');
      } catch (e) { console.error('[img2pdf]', e); window.PdfOps.setStatus(status, 'שגיאה: ' + (e && e.message || ''), 'err'); }
      finally { goBtn.disabled = false; goBtn.textContent = t; }
    }

    return App.el('div', { class: 'card' }, [
      App.el('div', { class: 'row row-between', style: { marginBottom: '16px' } },
        [App.el('h2', {}, '📄  תמונות ל-PDF'), App.el('span', { class: 'chip lavender' }, 'JPG/PNG לקובץ PDF')]),
      dz.input, dz.zone, list, status, goBtn,
      App.el('p', { style: { fontSize: '12px', color: 'var(--ink-mute)', margin: '10px 0 0', lineHeight: '1.6' } }, '🔒 רץ מקומית — התמונות לא עולות לשרת.')
    ]);
  }
  window.Tools = window.Tools || {};
  window.Tools.imgToPdf = buildImgToPdf;
})();
