(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // עריכת Word (P-49) — פעולות על קובץ docx קיים, מקומית לחלוטין:
  //  1) חיפוש-והחלפה בכל המסמך תוך שמירת כל העיצוב (עריכת XML בתוך ה-zip)
  //  2) שינויים-במעקב (Track Changes): ספירה, הצגה, וקבלת-הכל → גרסה נקייה
  //  3) חילוץ טקסט מלא
  // docx = zip (JSZip הקיים) + word/document.xml (DOMParser). → Tools.docxEdit
  // מגבלה מתועדת: החלפה עובדת בתוך "ריצת" טקסט אחת; ביטוי שפוצל ע"י Word
  // לריצות שונות (עיצוב באמצע) לא יוחלף — נספר ומדווח.
  // ─────────────────────────────────────────────────────────────────────────
  var W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  function buildDocxEdit() {
    var file = null, zip = null, xmlDoc = null;
    var status = window.PdfOps.statusEl();

    var findI = mkInput('הטקסט לחיפוש'), replI = mkInput('הטקסט החדש');
    function mkInput(ph) {
      var i = document.createElement('input');
      i.type = 'text'; i.placeholder = ph;
      i.style.cssText = 'flex:1;min-width:150px;padding:8px 12px;border:1px solid var(--line);border-radius:var(--r-sm);font-family:inherit;';
      return i;
    }

    var trackInfo = App.el('div', { style: { fontSize: '13px', marginTop: '10px', lineHeight: '1.7' } });
    var ctrls = App.el('div', { style: { display: 'none', marginTop: '12px' } }, [
      App.el('label', { style: { fontSize: '13px', fontWeight: 600 } }, '🔁 חיפוש והחלפה בכל המסמך:'),
      App.el('div', { style: { display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' } }, [findI, replI,
        App.el('button', { class: 'btn btn-sm', onClick: doReplace }, 'החלף')]),
      trackInfo,
      App.el('div', { style: { display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' } }, [
        App.el('button', { class: 'btn btn-sm', onClick: acceptAll }, '✔️ קבל את כל השינויים-במעקב'),
        App.el('button', { class: 'btn btn-sm btn-ghost', onClick: extractText }, '📃 חלץ טקסט'),
        App.el('button', { class: 'btn', onClick: saveDocx }, '💾 הורד את ה-Word הערוך')
      ])
    ]);

    var dz = window.PdfOps.dropzone({ icon: '📝', title: 'גרור קובץ Word (.docx) לעריכה', sub: 'חיפוש/החלפה · שינויים במעקב · חילוץ טקסט', onFiles: function (fl) { loadFile(fl[0]); } });
    dz.input.accept = '.docx';

    function wTags(tag) { return Array.prototype.slice.call(xmlDoc.getElementsByTagNameNS(W_NS, tag)); }

    function refreshTrack() {
      var ins = wTags('ins').length, del = wTags('del').length;
      if (ins + del === 0) { trackInfo.innerHTML = '<b>שינויים-במעקב:</b> אין — המסמך נקי.'; return; }
      var sample = wTags('ins').slice(0, 3).map(function (n) { return '"' + (n.textContent || '').slice(0, 40) + '"'; }).join(' · ');
      trackInfo.innerHTML = '<b>שינויים-במעקב:</b> ' + ins + ' הוספות, ' + del + ' מחיקות' + (sample ? ' · דוגמאות: ' + sample : '') +
        '<br><span style="color:var(--ink-mute)">"קבל הכל" ישאיר את ההוספות, יסלק את המחיקות ויפיק גרסה נקייה.</span>';
    }

    async function loadFile(f) {
      if (!f || !/\.docx$/i.test(f.name)) { window.PdfOps.setStatus(status, 'יש לבחור קובץ ‎.docx (קובץ ‎.doc ישן — המר קודם בכלי Word→PDF/המרה)', 'err'); return; }
      file = f;
      try {
        var JSZip = await window.PdfOps.ensureZip();
        zip = await JSZip.loadAsync(await f.arrayBuffer());
        var xmlStr = await zip.file('word/document.xml').async('string');
        xmlDoc = new DOMParser().parseFromString(xmlStr, 'application/xml');
        if (xmlDoc.getElementsByTagName('parsererror').length) throw new Error('document.xml לא תקין');
        window.PdfOps.setStatus(status, '✓ ' + f.name + ' נטען. בחר פעולה:', 'ok');
        ctrls.style.display = 'block';
        refreshTrack();
      } catch (e) { console.error('[docx-edit]', e); window.PdfOps.setStatus(status, 'שגיאה בטעינה: ' + (e && e.message || ''), 'err'); }
    }

    function doReplace() {
      var find = findI.value; if (!find) { window.PdfOps.setStatus(status, 'הזן טקסט לחיפוש', 'err'); return; }
      var repl = replI.value || '';
      var count = 0;
      wTags('t').forEach(function (t) {
        if (t.textContent.indexOf(find) > -1) {
          count += t.textContent.split(find).length - 1;
          t.textContent = t.textContent.split(find).join(repl);
          if (/^\s|\s$/.test(t.textContent)) t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
        }
      });
      window.PdfOps.setStatus(status, count ? '✓ הוחלפו ' + count + ' מופעים של "' + find + '". הורד כדי לשמור.' :
        'לא נמצאו מופעים שלמים. ייתכן שהביטוי מפוצל ע"י עיצוב באמצע — נסה קטע קצר יותר.', count ? 'ok' : 'err');
    }

    function acceptAll() {
      var del = wTags('del'), ins = wTags('ins');
      del.forEach(function (n) { n.parentNode.removeChild(n); });
      ins.forEach(function (n) {
        while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n);
        n.parentNode.removeChild(n);
      });
      // ניקוי רשומות שינוי-עיצוב-במעקב (rPrChange/pPrChange) — קבלה = השארת החדש
      ['rPrChange', 'pPrChange', 'sectPrChange', 'tblPrChange'].forEach(function (tag) {
        wTags(tag).forEach(function (n) { n.parentNode.removeChild(n); });
      });
      window.PdfOps.setStatus(status, '✓ התקבלו ' + ins.length + ' הוספות ונמחקו ' + del.length + ' מחיקות — גרסה נקייה. הורד כדי לשמור.', 'ok');
      refreshTrack();
    }

    function extractText() {
      var paras = wTags('p').map(function (p) { return p.textContent; }).filter(function (s) { return s.trim(); });
      var text = paras.join('\n');
      var blob = new Blob(['﻿' + text], { type: 'text/plain;charset=utf-8' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = file.name.replace(/\.docx$/i, '') + '.txt'; a.click();
      window.PdfOps.setStatus(status, '✓ חולצו ' + paras.length + ' פסקאות — ירד כקובץ טקסט', 'ok');
    }

    async function saveDocx() {
      try {
        zip.file('word/document.xml', new XMLSerializer().serializeToString(xmlDoc));
        var out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
        window.PdfOps.download(out, file.name.replace(/\.docx$/i, '') + '-ערוך.docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        window.PdfOps.setStatus(status, '✓ הקובץ הערוך ירד — כל העיצוב המקורי נשמר', 'ok');
      } catch (e) { console.error('[docx-edit]', e); window.PdfOps.setStatus(status, 'שגיאה בשמירה: ' + (e && e.message || ''), 'err'); }
    }

    return App.el('div', { class: 'card' }, [
      App.el('div', { class: 'row row-between', style: { marginBottom: '16px' } },
        [App.el('h2', {}, '📝  עריכת Word'), App.el('span', { class: 'chip lavender' }, 'החלפה גלובלית · שינויים במעקב · חילוץ')]),
      dz.input, dz.zone, status, ctrls,
      App.el('p', { style: { fontSize: '12px', color: 'var(--ink-mute)', margin: '10px 0 0', lineHeight: '1.6' } },
        '🔒 רץ מקומית — הקובץ לא עולה לשרת. העיצוב המקורי נשמר במלואו (העריכה בתוך ה-XML של המסמך).')
    ]);
  }
  window.Tools = window.Tools || {};
  window.Tools.docxEdit = buildDocxEdit;
})();
