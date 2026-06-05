(function () {
  // Rotate pages — rotate all or selected pages by 90/180/270° → new PDF. Local.
  function buildPdfRotate() {
    var file = null, pageCount = 0, angle = 90;
    var status = window.PdfOps.statusEl();

    var angleWrap = App.el('div', { style: { display: 'flex', gap: '8px', marginTop: '10px' } });
    [['90°↻', 90], ['180°', 180], ['270°↺', 270]].forEach(function (a) {
      var b = App.el('button', { style: angBtnStyle(a[1] === angle), onClick: function () { angle = a[1]; refreshAngle(); } }, a[0]);
      b._ang = a[1]; angleWrap.appendChild(b);
    });
    function angBtnStyle(active) {
      return { padding: '8px 14px', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit',
               border: '1px solid ' + (active ? 'var(--ink)' : 'var(--line)'), background: active ? '#fff' : 'var(--cream)' };
    }
    function refreshAngle() { Array.from(angleWrap.children).forEach(function (b) { var on = b._ang === angle; b.style.border = '1px solid ' + (on ? 'var(--ink)' : 'var(--line)'); b.style.background = on ? '#fff' : 'var(--cream)'; }); }

    var rangeInput = document.createElement('input');
    rangeInput.type = 'text'; rangeInput.placeholder = 'ריק = כל הדפים · או 1-3,5';
    rangeInput.style.cssText = 'width:100%;margin-top:6px;padding:9px 12px;border:1px solid var(--line);border-radius:var(--r-sm);font-family:inherit;direction:ltr;text-align:left;';

    var ctrls = App.el('div', { style: { display: 'none', marginTop: '12px' } }, [
      App.el('label', { style: { fontSize: '13px', color: 'var(--ink)' } }, 'זווית סיבוב:'), angleWrap,
      App.el('label', { style: { fontSize: '13px', color: 'var(--ink)', display: 'block', marginTop: '12px' } }, 'אילו דפים:'), rangeInput
    ]);
    var goBtn = App.el('button', { class: 'btn', style: { display: 'none', marginTop: '12px', padding: '10px 20px', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontWeight: 600 }, onClick: doRotate }, '🔄 סובב והורד');

    var dz = window.PdfOps.dropzone({ icon: '🔄', title: 'גרור קובץ PDF לסיבוב', sub: 'סובב את כל הדפים או חלקם', onFiles: function (fl) { loadFile(fl[0]); } });

    async function loadFile(f) {
      if (!f) return; file = f;
      try {
        var PDFLib = await window.PdfOps.ensureLib();
        var d = await PDFLib.PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
        pageCount = d.getPageCount();
        window.PdfOps.setStatus(status, '✓ ' + f.name + ' — ' + pageCount + ' עמודים. בחר זווית ודפים:', 'ok');
        ctrls.style.display = 'block'; goBtn.style.display = 'inline-block';
      } catch (e) { window.PdfOps.setStatus(status, 'שגיאה בטעינה: ' + (e && e.message || ''), 'err'); }
    }
    async function doRotate() {
      goBtn.disabled = true; var t = goBtn.textContent; goBtn.textContent = '⏳ מסובב…';
      try {
        var PDFLib = await window.PdfOps.ensureLib();
        var doc = await PDFLib.PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
        var idx = rangeInput.value.trim() ? window.PdfOps.parseRanges(rangeInput.value, pageCount) : doc.getPageIndices();
        if (!idx.length) { window.PdfOps.setStatus(status, 'טווח דפים לא תקין', 'err'); goBtn.disabled = false; goBtn.textContent = t; return; }
        var pages = doc.getPages();
        idx.forEach(function (i) { var p = pages[i]; var cur = (p.getRotation() && p.getRotation().angle) || 0; p.setRotation(PDFLib.degrees((cur + angle) % 360)); });
        window.PdfOps.download(await doc.save(), file.name.replace(/\.pdf$/i, '') + '-מסובב.pdf');
        window.PdfOps.setStatus(status, '✓ סובבו ' + idx.length + ' דפים ב-' + angle + '° — הורד', 'ok');
      } catch (e) { console.error('[pdf-rotate]', e); window.PdfOps.setStatus(status, 'שגיאה: ' + (e && e.message || ''), 'err'); }
      finally { goBtn.disabled = false; goBtn.textContent = t; }
    }

    return App.el('div', { class: 'card' }, [
      App.el('div', { class: 'row row-between', style: { marginBottom: '16px' } },
        [App.el('h2', {}, '🔄  סובב PDF'), App.el('span', { class: 'chip lavender' }, 'סובב דפים ב-90/180/270 מעלות')]),
      dz.input, dz.zone, status, ctrls, goBtn,
      App.el('p', { style: { fontSize: '12px', color: 'var(--ink-mute)', margin: '10px 0 0', lineHeight: '1.6' } }, '🔒 רץ מקומית — הקובץ לא עולה לשרת.')
    ]);
  }
  window.Tools = window.Tools || {};
  window.Tools.pdfRotate = buildPdfRotate;
})();
