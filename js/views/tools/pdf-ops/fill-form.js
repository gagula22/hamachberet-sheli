(function () {
  // Fill Form — מילוי טפסי PDF אינטראקטיביים (AcroForm) מקומית.
  // עברית: הגופנים הסטנדרטיים של pdf-lib לא כוללים עברית, לכן ערך עברי
  // מצויר כתמונת-canvas על מלבן השדה (bidi של הדפדפן) במקום setText.
  // אנגלית/מספרים ממולאים כשדה אמיתי (נשאר בר-עריכה).
  function buildPdfFillForm() {
    var file = null, fieldRows = [];
    var status = window.PdfOps.statusEl();
    var list = App.el('div', { style: { display: 'none', marginTop: '12px' } });
    var goBtn = App.el('button', { class: 'btn', style: { display: 'none', marginTop: '12px' }, onClick: doFill }, '🖊️ מלא והורד');

    var dz = window.PdfOps.dropzone({ icon: '🖊️', title: 'גרור טופס PDF למילוי', sub: 'טפסים עם שדות אינטראקטיביים (AcroForm)', onFiles: function (fl) { loadFile(fl[0]); } });

    var hasHeb = function (s) { return /[א-ת]/.test(s || ''); };

    async function loadFile(f) {
      if (!f) return; file = f; fieldRows = []; list.innerHTML = '';
      try {
        var PDFLib = await window.PdfOps.ensureLib();
        var doc = await PDFLib.PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
        var fields = doc.getForm().getFields();
        if (!fields.length) { window.PdfOps.setStatus(status, 'בטופס הזה אין שדות אינטראקטיביים. לטופס "שטוח" השתמש בכלי OCR/עריכה.', 'err'); return; }
        fields.forEach(function (fld) {
          var name = fld.getName(), type = fld.constructor.name;
          var row = App.el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' } });
          row.appendChild(App.el('span', { style: { fontSize: '13px', minWidth: '140px', fontWeight: 600 } }, name));
          var input = null;
          if (type === 'PDFTextField') {
            input = document.createElement('input'); input.type = 'text';
            try { input.value = fld.getText() || ''; } catch (e) {}
            input.style.cssText = 'flex:1;min-width:160px;padding:7px 11px;border:1px solid var(--line);border-radius:var(--r-sm);font-family:inherit;';
          } else if (type === 'PDFCheckBox') {
            input = document.createElement('input'); input.type = 'checkbox';
            try { input.checked = fld.isChecked(); } catch (e) {}
          } else if (type === 'PDFDropdown' || type === 'PDFRadioGroup') {
            var opts = [];
            try { opts = fld.getOptions(); } catch (e) {}
            input = App.el('select', { style: { flex: 1, minWidth: '160px', padding: '7px 11px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', fontFamily: 'inherit' } },
              [App.el('option', { value: '' }, '— בחר —')].concat(opts.map(function (o) { return App.el('option', { value: o }, o); })));
          } else {
            row.appendChild(App.el('span', { style: { fontSize: '12px', color: 'var(--ink-mute)' } }, '(' + type + ' — לא נתמך למילוי)'));
          }
          if (input) { row.appendChild(input); fieldRows.push({ name: name, type: type, input: input }); }
          list.appendChild(row);
        });
        window.PdfOps.setStatus(status, '✓ ' + f.name + ' — נמצאו ' + fields.length + ' שדות. מלא ולחץ:', 'ok');
        list.style.display = 'block'; goBtn.style.display = 'inline-block';
      } catch (e) { window.PdfOps.setStatus(status, 'שגיאה בטעינה: ' + (e && e.message || ''), 'err'); }
    }

    function hebPng(text, hPx) {
      var cv = document.createElement('canvas');
      var fs = Math.max(18, hPx * 3); // רזולוציה גבוהה לחדות
      var ctx = cv.getContext('2d');
      ctx.font = fs + "px 'Heebo','Segoe UI',Arial,sans-serif";
      cv.width = Math.ceil(ctx.measureText(text).width) + 12; cv.height = Math.ceil(fs * 1.35);
      ctx = cv.getContext('2d');
      ctx.font = fs + "px 'Heebo','Segoe UI',Arial,sans-serif";
      ctx.fillStyle = '#111'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl'; ctx.textAlign = 'right';
      ctx.fillText(text, cv.width - 6, cv.height / 2);
      return cv.toDataURL('image/png');
    }

    async function doFill() {
      goBtn.disabled = true; var t0 = goBtn.textContent; goBtn.textContent = '⏳ ממלא…';
      try {
        var PDFLib = await window.PdfOps.ensureLib();
        var doc = await PDFLib.PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
        var form = doc.getForm();
        var pages = doc.getPages();
        var filled = 0, overlaid = 0, failed = [];

        for (var i = 0; i < fieldRows.length; i++) {
          var r = fieldRows[i];
          try {
            if (r.type === 'PDFCheckBox') {
              var cb = form.getCheckBox(r.name);
              r.input.checked ? cb.check() : cb.uncheck(); filled++;
            } else if (r.type === 'PDFDropdown') {
              if (r.input.value) { form.getDropdown(r.name).select(r.input.value); filled++; }
            } else if (r.type === 'PDFRadioGroup') {
              if (r.input.value) { form.getRadioGroup(r.name).select(r.input.value); filled++; }
            } else if (r.type === 'PDFTextField') {
              var val = r.input.value;
              if (!val) continue;
              var tf = form.getTextField(r.name);
              if (hasHeb(val)) {
                // עברית: ציור כתמונה על מלבן השדה (העמוד הנכון לפי widget.P())
                var widget = tf.acroField.getWidgets()[0];
                var rect = widget.getRectangle();
                var pIdx = pages.findIndex(function (p) { return p.ref === widget.P(); });
                var page = pages[pIdx >= 0 ? pIdx : 0];
                var png = await doc.embedPng(hebPng(val, rect.height * 0.62));
                var drawH = rect.height * 0.78;
                var drawW = png.width * (drawH / png.height);
                if (drawW > rect.width) { drawW = rect.width * 0.96; drawH = png.height * (drawW / png.width); }
                page.drawImage(png, { x: rect.x + rect.width - drawW - 2, y: rect.y + (rect.height - drawH) / 2, width: drawW, height: drawH });
                try { tf.setText(''); } catch (e2) {}
                overlaid++;
              } else { tf.setText(val); filled++; }
            }
          } catch (e1) { failed.push(r.name); }
        }
        try { form.updateFieldAppearances(); } catch (e3) {}
        window.PdfOps.download(await doc.save(), file.name.replace(/\.pdf$/i, '') + '-מלא.pdf');
        var msg = '✓ מולאו ' + (filled + overlaid) + ' שדות (' + overlaid + ' בעברית כציור)';
        if (failed.length) msg += ' · נכשלו: ' + failed.join(', ');
        window.PdfOps.setStatus(status, msg + ' — הורד', failed.length ? undefined : 'ok');
      } catch (e) { console.error('[pdf-fill]', e); window.PdfOps.setStatus(status, 'שגיאה: ' + (e && e.message || ''), 'err'); }
      finally { goBtn.disabled = false; goBtn.textContent = t0; }
    }

    return App.el('div', { class: 'card' }, [
      App.el('div', { class: 'row row-between', style: { marginBottom: '16px' } },
        [App.el('h2', {}, '🖊️  מילוי טופס PDF'), App.el('span', { class: 'chip lavender' }, 'שדות אינטראקטיביים · עברית נתמכת')]),
      dz.input, dz.zone, status, list, goBtn,
      App.el('p', { style: { fontSize: '12px', color: 'var(--ink-mute)', margin: '10px 0 0' } }, '🔒 רץ מקומית. ערכים בעברית מצוירים על השדה (הגופנים המובנים של PDF לא כוללים עברית); אנגלית/מספרים נשארים שדה בר-עריכה.')
    ]);
  }
  window.Tools = window.Tools || {};
  window.Tools.pdfFillForm = buildPdfFillForm;
})();
