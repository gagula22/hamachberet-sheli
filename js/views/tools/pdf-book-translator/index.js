(function () {
  'use strict';
  // ───────────────────────────────────────────────────────────────────────────
  // window.Tools.pdfBookTranslator — הכלי "תרגום ספרי PDF לעברית כולל תרגום תמונות".
  // UI + תזמור + בורר-תיקייה ושמירה. כל הצנרת הכבדה ב-engine.js (window.PBT_ENGINE).
  // עצמאי לחלוטין — אפס Claude, אפס מפתח Store, אפס CSS משותף (סגנונות inline).
  // ───────────────────────────────────────────────────────────────────────────
  var E = function () { return window.PBT_ENGINE; };

  // State ברמת המודול — שורד ניווט/סגירת המודל (כמו כלי תרגום-PDF).
  var _running = false, _cancelled = false;
  var _result = null;   // { pdfBytes, baseName, translatedCount, pages, total }

  function parseRanges(str, max) {
    var set = {};
    (str || '').split(',').forEach(function (part) {
      part = part.trim(); if (!part) return;
      var m = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) { var a = +m[1], b = +m[2]; if (a > b) { var t = a; a = b; b = t; } for (var i = a; i <= b; i++) if (i >= 1 && i <= max) set[i] = 1; }
      else { var n = +part; if (n >= 1 && n <= max) set[n] = 1; }
    });
    return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
  }

  // ── שמירה לתיקייה שהמשתמש בוחר (File System Access API) + נפילה להורדה ──────
  async function saveResult(statusFn) {
    if (!_result) return;
    var fname = _result.baseName + '_עברית_תמונות.pdf';
    var bytes = _result.pdfBytes;
    if (window.showDirectoryPicker) {
      try {
        var dir = await window.showDirectoryPicker({ mode: 'readwrite' });
        var fh = await dir.getFileHandle(fname, { create: true });
        var ws = await fh.createWritable();
        await ws.write(bytes);
        await ws.close();
        statusFn('✓ נשמר בתיקייה שבחרת: ' + fname, 'ok');
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') { statusFn('בחירת התיקייה בוטלה', ''); return; }
        // נפילה להורדה רגילה אם אין הרשאה/נתמך
      }
    }
    var blob = new Blob([bytes], { type: 'application/pdf' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = fname; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
    statusFn('✓ הורד: ' + fname + ' (הדפדפן שלך לא תומך בבחירת תיקייה — הקובץ ירד לתיקיית ההורדות)', 'ok');
  }

  function build() {
    var el = App.el;

    var status = el('p', { style: { margin: '12px 0 0', fontSize: '13px', color: 'var(--ink-mute)', lineHeight: '1.6' } });
    function setStatus(msg, kind) {
      status.textContent = msg;
      status.style.color = kind === 'ok' ? 'var(--sage-deep)' : kind === 'err' ? '#c00' : 'var(--ink-mute)';
    }

    var barTrack = el('div', { style: { marginTop: '12px', height: '6px', background: '#e8e8e8', borderRadius: '3px', overflow: 'hidden', display: 'none' } });
    var barFill = el('div', { style: { height: '6px', width: '0', background: 'linear-gradient(90deg,#f5df8c,#e0b84a)', transition: 'width 350ms ease' } });
    barTrack.appendChild(barFill);

    var cancelBtn = el('button', {
      style: { display: 'none', marginTop: '10px', padding: '6px 16px', background: '#fff8f8', border: '1px solid #ffb3b3', borderRadius: '8px', fontSize: '12px', color: '#c00', cursor: 'pointer' }
    }, '✕ בטל תרגום');
    cancelBtn.onclick = function () { _cancelled = true; setStatus('מבטל…', ''); };

    var saveBtn = el('button', {
      style: { display: 'none', marginTop: '12px', padding: '11px 18px', background: 'linear-gradient(135deg,#f5df8c,#e0b84a)', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', color: '#5a4a1a' }
    }, '📁 שמור את ה-PDF המתורגם לתיקייה…');
    saveBtn.onclick = function () { saveResult(setStatus); };

    var rangeInput = el('input', {
      type: 'text', placeholder: 'למשל 1-5 (השאר ריק = כל הספר)',
      style: { width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1px solid var(--line)', borderRadius: '8px', fontSize: '13px', marginTop: '4px', direction: 'ltr', textAlign: 'left' }
    });

    function showDone() {
      barFill.style.width = '100%';
      cancelBtn.style.display = 'none';
      saveBtn.style.display = 'inline-block';
      setStatus('✓ הושלם — ' + _result.translatedCount + ' בלוקי טקסט תורגמו על פני ' + _result.pages + ' עמודים. עכשיו בחר תיקיית יעד לשמירה.', 'ok');
    }

    // שחזור מצב אם תרגום רץ/הסתיים כשהמודל נפתח מחדש
    if (_running) { barTrack.style.display = 'block'; barFill.style.width = '50%'; cancelBtn.style.display = 'inline-block'; setStatus('תרגום פעיל ברקע…', ''); }
    else if (_result) { barTrack.style.display = 'block'; showDone(); }

    function onStatus(phase, pct, text) {
      if (!document.body.contains(status)) {
        // המודל נסגר — נמשיך ברקע; נציג בסיום toast קצר
        if (phase === 'ready' && window.App && App.toast) App.toast('✅ תרגום הספר הושלם — פתח את הכלי לשמירה');
        return;
      }
      if (phase === 'progress') { barFill.style.width = pct + '%'; setStatus(text, ''); }
      else if (phase === 'ready') { showDone(); }
      else if (phase === 'error') { barFill.style.width = '0'; cancelBtn.style.display = 'none'; setStatus('שגיאה: ' + text, 'err'); }
      else if (phase === 'cancelled') { barFill.style.width = '0'; cancelBtn.style.display = 'none'; barTrack.style.display = 'none'; setStatus('התרגום בוטל', ''); }
    }

    async function processFile(file) {
      if (!file || _running) return;
      if (!/\.pdf$/i.test(file.name)) { setStatus('יש לבחור קובץ PDF', 'err'); return; }
      if (!window.pdfjsLib) { setStatus('ספריית PDF לא נטענה', 'err'); return; }

      var range = parseRanges(rangeInput.value, 100000);
      _running = true; _cancelled = false; _result = null;
      barTrack.style.display = 'block'; barFill.style.width = '2%';
      cancelBtn.style.display = 'inline-block'; saveBtn.style.display = 'none';
      setStatus('מתחיל…', '');

      try {
        var res = await E().run(file, {
          pages: range, scale: 2.0,
          onStatus: onStatus,
          cancelCheck: function () { return _cancelled; }
        });
        _result = res;
        onStatus('ready', 100, '');
      } catch (e) {
        if (e && e.message === 'CANCELLED') onStatus('cancelled', 0, '');
        else { onStatus('error', 0, (e && (e.message || e.toString())) || 'שגיאה לא ידועה'); console.error('[pdf-book-translator]', e); }
      } finally {
        _running = false;
      }
    }

    // ── אזור גרירה/בחירה ──────────────────────────────────────────────────────
    var fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.accept = '.pdf'; fileInput.style.display = 'none';
    fileInput.addEventListener('change', function () { if (fileInput.files[0]) processFile(fileInput.files[0]); fileInput.value = ''; });

    var zone = el('div', {
      style: { border: '2px dashed var(--line)', borderRadius: 'var(--r-md)', padding: '34px 20px', textAlign: 'center', cursor: 'pointer', transition: 'all 180ms', background: 'var(--cream)', marginTop: '12px' },
      onClick: function () { if (!_running) fileInput.click(); }
    }, [
      el('div', { style: { fontSize: '42px', marginBottom: '8px' } }, '📚'),
      el('div', { style: { fontWeight: 600, marginBottom: '4px' } }, 'גרור קובץ PDF לכאן'),
      el('div', { style: { fontSize: '13px', color: 'var(--ink-mute)' } }, 'אנגלית → עברית · התרגום מצויר ישירות על העמוד · הכול מקומי בדפדפן')
    ]);
    zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.style.borderColor = '#e0b84a'; zone.style.background = '#fffaf0'; });
    zone.addEventListener('dragleave', function () { zone.style.borderColor = 'var(--line)'; zone.style.background = 'var(--cream)'; });
    zone.addEventListener('drop', function (e) { e.preventDefault(); zone.style.borderColor = 'var(--line)'; zone.style.background = 'var(--cream)'; if (!_running && e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); });

    var info = el('div', {
      style: { background: '#fffaf0', border: '1px solid #f0d98c', borderRadius: 'var(--r-sm)', padding: '11px 16px', marginBottom: '4px', lineHeight: '1.65' }
    }, [
      el('strong', { style: { fontSize: '13px' } }, '🖌️ תרגום שמצויר על גבי התמונה — כאילו נכתב במקור בעברית'),
      el('br', {}),
      el('span', { style: { fontSize: '12px', color: 'var(--ink-mute)' } },
        'כל עמוד מרונדר → זיהוי טקסט מקומי (Tesseract) → תרגום (MyMemory) → הטקסט האנגלי מכוסה והעברית מצוירת במקומו. ' +
        'מספרים, מחירים ותאריכים נשמרים. בסיום בוחרים תיקיית יעד והקובץ נשמר שם. ' +
        'הערה: ספר שלם איטי ועלול להיתקל במגבלת שירות התרגום — מומלץ להתחיל מטווח עמודים קטן לבדיקת איכות.')
    ]);

    return el('div', { class: 'card' }, [
      el('div', { class: 'row row-between', style: { marginBottom: '14px' } }, [
        el('h2', {}, 'תרגום ספרי PDF לעברית כולל תרגום תמונות'),
        el('span', { class: 'chip sage' }, 'מקומי · overlay · ללא עלות')
      ]),
      info,
      el('label', { style: { display: 'block', fontSize: '13px', color: 'var(--ink-soft)', marginTop: '8px', fontWeight: '600' } }, 'טווח עמודים (אופציונלי):'),
      rangeInput,
      zone, status, barTrack, cancelBtn, saveBtn
    ]);
  }

  window.Tools = window.Tools || {};
  window.Tools.pdfBookTranslator = build;
})();
