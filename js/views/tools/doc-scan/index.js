(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // סריקת מסמך מהמצלמה — כלי עצמאי (window.Tools.docScan).
  // מצלמים/בוחרים תמונה (בטלפון נפתחת המצלמה: capture=environment) →
  // OCR עברית+אנגלית מקומי (Tesseract המאורז — אפס העלאה) → טקסט לעריכה →
  // בחירה לאן להכניס: עמוד חדש בתוך מחברת קיימת, או מחברת חדשה בשם
  // שהמשתמש נותן (לפי בקשת המשתמש). אפשר לכלול גם את הצילום עצמו.
  // ─────────────────────────────────────────────────────────────────────────

  // נתיב מוחלט — בתוך ה-Worker של Tesseract נתיבים יחסיים לא נפתרים נכון
  function vendorBase() { return location.origin + '/js/vendor/tesseract/'; }

  var _tp = null;
  function ensureTesseract() {
    if (window.Tesseract) return Promise.resolve();
    if (_tp) return _tp;
    _tp = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = vendorBase() + 'tesseract.min.js';
      s.onload = function () { window.Tesseract ? res() : rej(new Error('Tesseract missing')); };
      s.onerror = function () { _tp = null; rej(new Error('טעינת מנוע ה-OCR נכשלה')); };
      document.head.appendChild(s);
    });
    return _tp;
  }

  function el(t, a, k) { return App.el(t, a || {}, k || []); }

  function fileToCanvas(file) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () {
        // הגבלת רוחב ל-2000px — מספיק ל-OCR, חוסך זיכרון
        var scale = Math.min(1, 2000 / img.naturalWidth);
        var c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        var ctx = c.getContext('2d', { alpha: false });
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        res(c);
      };
      img.onerror = function () { rej(new Error('קריאת התמונה נכשלה')); };
      img.src = URL.createObjectURL(file);
    });
  }

  function textToHtml(text) {
    return text.split(/\n{2,}/).map(function (p) {
      var t = p.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      if (!t) return '';
      return '<p>' + t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
    }).filter(Boolean).join('\n');
  }

  function createScanTopic(parentId, name, bodyHtml) {
    var id = Store.uid();
    Store.update('topics', function (list) {
      return list.concat([{
        id: id, name: name, body: bodyHtml, parentId: parentId || null,
        tags: ['סריקה'], createdAt: Date.now(), updatedAt: Date.now(),
        order: list.length, icon: '📷'
      }]);
    });
    return id;
  }

  function buildDocScan() {
    var canvas = null;
    var status = el('div', { class: 'ds-status' });
    function setStatus(msg, cls) { status.textContent = msg; status.className = 'ds-status' + (cls ? ' ' + cls : ''); }

    var input = el('input', { type: 'file', accept: 'image/*', capture: 'environment', style: { display: 'none' } });
    var preview = el('img', { class: 'ds-preview', style: { display: 'none' } });
    var ta = el('textarea', { class: 'textarea ds-text', rows: '8', placeholder: 'הטקסט המזוהה יופיע כאן לעריכה…', style: { display: 'none' } });
    var includeImg = el('input', { type: 'checkbox', checked: true });
    var saveRow = el('div', { class: 'ds-save-row', style: { display: 'none' } });
    var runBtn = el('button', { class: 'btn ds-run', style: { display: 'none' } }, '🔍 זהה טקסט (OCR)');

    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (!f) return;
      fileToCanvas(f).then(function (c) {
        canvas = c;
        preview.src = c.toDataURL('image/jpeg', 0.8);
        preview.style.display = 'block';
        runBtn.style.display = 'inline-block';
        ta.style.display = 'none';
        saveRow.style.display = 'none';
        setStatus('✓ התמונה נטענה — לחץ לזיהוי טקסט');
      }).catch(function (e) { setStatus('שגיאה: ' + e.message, 'err'); });
    });

    runBtn.addEventListener('click', async function () {
      if (!canvas) return;
      runBtn.disabled = true;
      try {
        setStatus('טוען מנוע OCR (פעם ראשונה — כמה שניות)…');
        await ensureTesseract();
        var b = vendorBase();
        var worker = await Tesseract.createWorker('heb+eng', 1, { workerPath: b + 'worker.min.js', corePath: b, langPath: b });
        setStatus('🔍 מזהה טקסט…');
        var res = await worker.recognize(canvas);
        await worker.terminate();
        ta.value = (res.data.text || '').trim();
        ta.style.display = 'block';
        saveRow.style.display = 'flex';
        setStatus(ta.value ? '✓ הטקסט זוהה — ערוך אם צריך ובחר לאן לשמור' : 'לא זוהה טקסט בתמונה — אפשר לשמור רק את הצילום', ta.value ? 'ok' : '');
      } catch (e) {
        setStatus('OCR נכשל: ' + (e && (e.message || e.toString())), 'err');
        console.warn('[doc-scan] OCR error:', e);
      }
      runBtn.disabled = false;
    });

    // ── בורר יעד: מחברת קיימת או חדשה ──────────────────────────────────────
    function buildBody() {
      var html = '';
      if (includeImg.checked && canvas) {
        html += '<figure class="nb-img"><img src="' + canvas.toDataURL('image/jpeg', 0.82) + '" alt="סריקה" style="width:100%"></figure>\n';
      }
      html += textToHtml(ta.value || '');
      return html || '<p></p>';
    }
    function scanName() {
      var firstWords = (ta.value || '').trim().split(/\s+/).slice(0, 5).join(' ');
      return firstWords.length > 3 ? firstWords.slice(0, 40) : 'סריקה ' + new Date().toLocaleDateString('he-IL');
    }
    function openPicker() {
      var roots = ((window.nbTree ? nbTree.getTopics() : Store.get('topics')) || []).filter(function (t) { return !t.parentId; });
      var overlay = el('div', { class: 'ds-overlay', onClick: function (e) { if (e.target === overlay) overlay.remove(); } });
      function finish(parentId) {
        overlay.remove();
        var tid = createScanTopic(parentId, scanName(), buildBody());
        App.toast('📷 הסריקה נשמרה במחברת');
        // סגירת מודל הכלי (מאזין ה-Escape של מסך הכלים)
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        if (window.TopicOpen) TopicOpen.open(tid);
      }
      var list = el('div', { class: 'ds-pick-list' },
        roots.length ? roots.map(function (t) {
          return el('button', { class: 'ds-pick-item', onClick: function () { finish(t.id); } }, '📓 ' + (t.name || '(מחברת)'));
        }) : [el('div', { class: 'ds-pick-empty' }, 'אין עדיין מחברות — צור חדשה למטה.')]);
      var newName = el('input', { class: 'input', type: 'text', placeholder: 'שם המחברת החדשה…' });
      overlay.appendChild(el('div', { class: 'ds-pick-box', onClick: function (e) { e.stopPropagation(); } }, [
        el('h3', {}, 'לאיזו מחברת להכניס את הסריקה?'),
        el('div', { class: 'ds-pick-sub' }, 'הסריקה תישמר כעמוד חדש בתוך המחברת שתבחר.'),
        list,
        el('div', { class: 'ds-pick-new' }, [
          newName,
          el('button', { class: 'ds-pick-create', onClick: function () {
            var name = newName.value.trim();
            if (!name) { App.toast('תן שם למחברת החדשה'); return; }
            var rootId = Store.uid();
            Store.update('topics', function (l) {
              return l.concat([{ id: rootId, name: name, body: '', parentId: null, tags: [], createdAt: Date.now(), updatedAt: Date.now(), order: l.length, icon: '📓' }]);
            });
            finish(rootId);
          } }, '+ מחברת חדשה')
        ])
      ]));
      document.body.appendChild(overlay);
    }

    saveRow.appendChild(el('label', { class: 'ds-include' }, [includeImg, el('span', {}, 'כלול גם את הצילום עצמו')]));
    saveRow.appendChild(el('button', { class: 'ds-save', onClick: openPicker }, '📓 שמור למחברת…'));

    return el('div', { class: 'ds-card' }, [
      el('h3', { class: 'ds-title' }, '📷 סריקת מסמך'),
      el('div', { class: 'ds-sub' }, 'צלם מסמך (בטלפון תיפתח המצלמה) או בחר תמונה — הטקסט יזוהה מקומית (עברית+אנגלית, בלי העלאה לשרת) ויישמר כעמוד חדש במחברת שתבחר.'),
      el('button', { class: 'ds-pickfile', onClick: function () { input.click(); } }, '📷 צלם / בחר תמונה'),
      input, preview, runBtn, ta, saveRow, status
    ]);
  }

  window.Tools = window.Tools || {};
  window.Tools.docScan = buildDocScan;
})();
