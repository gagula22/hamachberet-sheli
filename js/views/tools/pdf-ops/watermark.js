(function () {
  // Watermark — מוסיף סימן-מים טקסטואלי לכל עמודי ה-PDF. עברית נתמכת מלא:
  // הטקסט מצויר ל-canvas (הדפדפן עושה bidi) ומוטמע כ-PNG שקוף — עוקף את
  // מגבלת הגופנים הסטנדרטיים של pdf-lib שאינם כוללים עברית. מקומי לחלוטין.
  function buildPdfWatermark() {
    var file = null;
    var status = window.PdfOps.statusEl();

    var textInput = document.createElement('input');
    textInput.type = 'text'; textInput.value = 'טיוטה';
    textInput.style.cssText = 'width:100%;margin-top:6px;padding:9px 12px;border:1px solid var(--line);border-radius:var(--r-sm);font-family:inherit;';

    var sizeSel = App.el('select', { style: { marginTop: '6px', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', fontFamily: 'inherit', width: '100%' } },
      [['0.8', 'גדול — על רוב העמוד'], ['0.55', 'בינוני'], ['0.35', 'קטן']].map(function (o) { return App.el('option', { value: o[0] }, o[1]); }));
    var opSel = App.el('select', { style: { marginTop: '6px', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', fontFamily: 'inherit', width: '100%' } },
      [['0.16', 'עדין (16%)'], ['0.3', 'בינוני (30%)'], ['0.5', 'בולט (50%)']].map(function (o) { return App.el('option', { value: o[0] }, o[1]); }));

    var ctrls = App.el('div', { style: { display: 'none', marginTop: '12px' } }, [
      App.el('label', { style: { fontSize: '13px' } }, 'טקסט הסימן:'), textInput,
      App.el('label', { style: { fontSize: '13px', display: 'block', marginTop: '10px' } }, 'גודל:'), sizeSel,
      App.el('label', { style: { fontSize: '13px', display: 'block', marginTop: '10px' } }, 'שקיפות:'), opSel
    ]);
    var goBtn = App.el('button', { class: 'btn', style: { display: 'none', marginTop: '12px' }, onClick: doStamp }, '💧 הוסף סימן מים והורד');

    var dz = window.PdfOps.dropzone({ icon: '💧', title: 'גרור PDF להוספת סימן מים', sub: 'למשל: טיוטה · סודי · שם העסק', onFiles: function (fl) { loadFile(fl[0]); } });

    async function loadFile(f) {
      if (!f) return; file = f;
      window.PdfOps.setStatus(status, '✓ ' + f.name + ' — בחר טקסט ולחץ:', 'ok');
      ctrls.style.display = 'block'; goBtn.style.display = 'inline-block';
    }

    function textToPng(text, opacity) {
      var cv = document.createElement('canvas');
      cv.width = 1400; cv.height = 1400;
      var ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.globalAlpha = opacity;
      ctx.fillStyle = '#666';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // התאמת גודל הפונט לרוחב הטקסט
      var size = 190;
      ctx.font = '700 ' + size + "px 'Heebo','Segoe UI',Arial,sans-serif";
      var w = ctx.measureText(text).width;
      if (w > 1200) { size = Math.floor(size * 1200 / w); ctx.font = '700 ' + size + "px 'Heebo','Segoe UI',Arial,sans-serif"; }
      ctx.translate(cv.width / 2, cv.height / 2);
      ctx.rotate(-30 * Math.PI / 180);
      ctx.fillText(text, 0, 0);
      return cv.toDataURL('image/png');
    }

    async function doStamp() {
      var text = textInput.value.trim();
      if (!text) { window.PdfOps.setStatus(status, 'הזן טקסט לסימן המים', 'err'); return; }
      goBtn.disabled = true; var t0 = goBtn.textContent; goBtn.textContent = '⏳ מוסיף…';
      try {
        var PDFLib = await window.PdfOps.ensureLib();
        var doc = await PDFLib.PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
        var png = await doc.embedPng(textToPng(text, parseFloat(opSel.value)));
        var frac = parseFloat(sizeSel.value);
        doc.getPages().forEach(function (p) {
          var pw = p.getWidth(), ph = p.getHeight();
          var side = Math.min(pw, ph) * frac / 0.55; // מנורמל כך ש"בינוני" ≈ 55% מהצד הקצר
          side = Math.min(side, Math.min(pw, ph) * 1.4);
          p.drawImage(png, { x: (pw - side) / 2, y: (ph - side) / 2, width: side, height: side });
        });
        window.PdfOps.download(await doc.save(), file.name.replace(/\.pdf$/i, '') + '-סימן-מים.pdf');
        window.PdfOps.setStatus(status, '✓ סימן המים נוסף לכל ' + doc.getPageCount() + ' העמודים — הורד', 'ok');
      } catch (e) { console.error('[pdf-watermark]', e); window.PdfOps.setStatus(status, 'שגיאה: ' + (e && e.message || ''), 'err'); }
      finally { goBtn.disabled = false; goBtn.textContent = t0; }
    }

    return App.el('div', { class: 'card' }, [
      App.el('div', { class: 'row row-between', style: { marginBottom: '16px' } },
        [App.el('h2', {}, '💧  סימן מים'), App.el('span', { class: 'chip lavender' }, 'טיוטה / סודי / מותג — על כל העמודים')]),
      dz.input, dz.zone, status, ctrls, goBtn,
      App.el('p', { style: { fontSize: '12px', color: 'var(--ink-mute)', margin: '10px 0 0' } }, '🔒 רץ מקומית — הקובץ לא עולה לשרת. עברית נתמכת מלא.')
    ]);
  }
  window.Tools = window.Tools || {};
  window.Tools.pdfWatermark = buildPdfWatermark;
})();
