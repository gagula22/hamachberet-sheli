(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // לוח שרטוט חופשי — אחריות עצמאית (בהשראת Excalidraw), Canvas API נקי.
  // כלים: עט, קו ישר, מלבן, עיגול, חץ, מחק; צבעי הפלטה; 3 עוביים; undo;
  // ניקוי; הורדת PNG; "הוסף למחברת" — בורר נושא קיים או מחברת חדשה בשם
  // שתבחר (הכתיבה ל-topics נעשית דרך nbTree.updateTopic / Store —
  // פעולת משתמש מפורשת). השרטוט משובץ כ-figure.nb-img, אותו מבנה שהעורך
  // יוצר לתמונות, כך שכל ההתנהגויות (גודל/מחיקה) נדבקות אוטומטית.
  // ─────────────────────────────────────────────────────────────────────────

  function el(t, a, k) { return App.el(t, a || {}, k || []); }

  var COLORS = ['#3B3A3A', '#B3455A', '#2D7A4A', '#2C5F8A', '#8a5a2c', '#7B5FA8'];
  var WIDTHS = [2, 4, 8];

  function renderView(root) {
    var state = { tool: 'pen', color: COLORS[0], width: WIDTHS[1], drawing: false, x0: 0, y0: 0, undo: [], snapshot: null };

    var canvas = el('canvas', { class: 'sk-canvas' });
    var ctx = null;

    function sizeCanvas() {
      var wrap = canvas.parentElement;
      if (!wrap) return;
      var w = Math.min(wrap.clientWidth - 2, 1100);
      var h = Math.max(420, Math.round(w * 0.62));
      // שמירת התוכן בעת שינוי גודל
      var prev = canvas.width ? canvas.toDataURL() : null;
      canvas.width = w; canvas.height = h;
      ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (prev) {
        var img = new Image();
        img.onload = function () { ctx.drawImage(img, 0, 0); };
        img.src = prev;
      }
    }

    function pushUndo() {
      try {
        state.undo.push(canvas.toDataURL());
        if (state.undo.length > 30) state.undo.shift();
      } catch (e) {}
    }
    function doUndo() {
      var prev = state.undo.pop();
      if (!prev) return;
      var img = new Image();
      img.onload = function () {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      };
      img.src = prev;
    }

    function pos(e) {
      var r = canvas.getBoundingClientRect();
      var p = e.touches ? e.touches[0] : e;
      return { x: (p.clientX - r.left) * (canvas.width / r.width), y: (p.clientY - r.top) * (canvas.height / r.height) };
    }

    function applyStyle() {
      ctx.strokeStyle = state.tool === 'erase' ? '#FFFFFF' : state.color;
      ctx.lineWidth = state.tool === 'erase' ? state.width * 4 : state.width;
    }

    function drawShape(x0, y0, x1, y1) {
      applyStyle();
      ctx.beginPath();
      if (state.tool === 'line' || state.tool === 'arrow') {
        ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
        if (state.tool === 'arrow') {
          var ang = Math.atan2(y1 - y0, x1 - x0), len = 12 + state.width * 2;
          ctx.moveTo(x1, y1);
          ctx.lineTo(x1 - len * Math.cos(ang - 0.45), y1 - len * Math.sin(ang - 0.45));
          ctx.moveTo(x1, y1);
          ctx.lineTo(x1 - len * Math.cos(ang + 0.45), y1 - len * Math.sin(ang + 0.45));
        }
      } else if (state.tool === 'rect') {
        ctx.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      } else if (state.tool === 'ellipse') {
        ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2 || 1, Math.abs(y1 - y0) / 2 || 1, 0, 0, Math.PI * 2);
      }
      ctx.stroke();
    }

    function start(e) {
      e.preventDefault();
      var p = pos(e);
      state.drawing = true; state.x0 = p.x; state.y0 = p.y;
      pushUndo();
      if (state.tool === 'pen' || state.tool === 'erase') {
        applyStyle();
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
      } else {
        state.snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
      }
    }
    function move(e) {
      if (!state.drawing) return;
      e.preventDefault();
      var p = pos(e);
      if (state.tool === 'pen' || state.tool === 'erase') {
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      } else if (state.snapshot) {
        ctx.putImageData(state.snapshot, 0, 0);
        drawShape(state.x0, state.y0, p.x, p.y);
      }
    }
    function end() {
      state.drawing = false;
      state.snapshot = null;
    }

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);

    // ── סרגל כלים ────────────────────────────────────────────────────────────
    var TOOLS = [['pen', '✏️ עט'], ['line', '― קו'], ['arrow', '➤ חץ'], ['rect', '▭ מלבן'], ['ellipse', '◯ עיגול'], ['erase', '🧽 מחק']];
    function toolbar() {
      var bar = el('div', { class: 'sk-bar' });
      TOOLS.forEach(function (t) {
        var b = el('button', { class: 'sk-btn' + (state.tool === t[0] ? ' active' : ''), onClick: function () {
          state.tool = t[0];
          bar.querySelectorAll('.sk-btn').forEach(function (x) { x.classList.remove('active'); });
          b.classList.add('active');
        } }, t[1]);
        bar.appendChild(b);
      });
      bar.appendChild(el('span', { class: 'sk-sep' }));
      COLORS.forEach(function (c) {
        var b = el('button', { class: 'sk-color' + (state.color === c ? ' active' : ''), title: 'צבע' });
        b.style.background = c;
        b.addEventListener('click', function () {
          state.color = c;
          bar.querySelectorAll('.sk-color').forEach(function (x) { x.classList.remove('active'); });
          b.classList.add('active');
        });
        bar.appendChild(b);
      });
      bar.appendChild(el('span', { class: 'sk-sep' }));
      WIDTHS.forEach(function (w) {
        var b = el('button', { class: 'sk-width' + (state.width === w ? ' active' : ''), title: 'עובי ' + w });
        b.appendChild(el('span', { class: 'sk-dot', style: { width: (w + 3) + 'px', height: (w + 3) + 'px' } }));
        b.addEventListener('click', function () {
          state.width = w;
          bar.querySelectorAll('.sk-width').forEach(function (x) { x.classList.remove('active'); });
          b.classList.add('active');
        });
        bar.appendChild(b);
      });
      bar.appendChild(el('span', { class: 'sk-sep' }));
      bar.appendChild(el('button', { class: 'sk-btn', onClick: doUndo }, '↩ בטל'));
      bar.appendChild(el('button', { class: 'sk-btn', onClick: function () {
        if (!confirm('לנקות את הלוח?')) return;
        pushUndo();
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } }, '🗑 נקה'));
      return bar;
    }

    // ── שמירה ────────────────────────────────────────────────────────────────
    function downloadPng() {
      var a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = 'שרטוט-' + Store.todayKey() + '.png';
      a.click();
    }

    function insertIntoTopic(topicId) {
      var dataUrl = canvas.toDataURL('image/png');
      var figure = '<figure class="nb-img"><img src="' + dataUrl + '" alt="שרטוט" style="width:100%"></figure><p><br></p>';
      var t = window.nbTree ? nbTree.getById(topicId) : null;
      if (window.nbTree && t) {
        nbTree.updateTopic(topicId, { body: (t.body || '') + figure });
      } else {
        Store.update('topics', function (list) {
          return list.map(function (x) { return x.id === topicId ? Object.assign({}, x, { body: (x.body || '') + figure, updatedAt: Date.now() }) : x; });
        });
      }
      App.toast('✏️ השרטוט נוסף למחברת');
      if (window.TopicOpen) TopicOpen.open(topicId);
    }

    function pickerOverlay() {
      var topics = (window.nbTree ? nbTree.getTopics() : Store.get('topics')) || [];
      var overlay = el('div', { class: 'sk-overlay', onClick: function (e) { if (e.target === overlay) overlay.remove(); } });
      var list = el('div', { class: 'sk-pick-list' });
      topics.forEach(function (t) {
        list.appendChild(el('button', { class: 'sk-pick-item', onClick: function () { overlay.remove(); insertIntoTopic(t.id); } },
          (t.parentId ? '└ ' : '📓 ') + (t.name || '(נושא)')));
      });
      if (!topics.length) list.appendChild(el('div', { class: 'sk-pick-empty' }, 'אין עדיין נושאים — צור מחברת חדשה למטה.'));
      var newName = el('input', { class: 'input', type: 'text', placeholder: 'שם המחברת החדשה…' });
      var box = el('div', { class: 'sk-pick-box', onClick: function (e) { e.stopPropagation(); } }, [
        el('h3', {}, 'לאן להוסיף את השרטוט?'),
        list,
        el('div', { class: 'sk-pick-new' }, [
          newName,
          el('button', { class: 'sk-pick-create', onClick: function () {
            var name = newName.value.trim();
            if (!name) { App.toast('תן שם למחברת החדשה'); return; }
            var id = Store.uid();
            Store.update('topics', function (l) {
              return l.concat([{ id: id, name: name, body: '', parentId: null, tags: [], createdAt: Date.now(), updatedAt: Date.now(), order: l.length, icon: '📓' }]);
            });
            overlay.remove();
            insertIntoTopic(id);
          } }, '+ צור מחברת חדשה')
        ])
      ]);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    }

    // ── הרכבה ────────────────────────────────────────────────────────────────
    var wrap = el('div', { class: 'card sk-card' }, [
      el('h2', {}, '✏️ לוח שרטוט'),
      toolbar(),
      el('div', { class: 'sk-canvas-wrap' }, canvas),
      el('div', { class: 'sk-actions' }, [
        el('button', { class: 'sk-action', onClick: downloadPng }, '⬇ הורד PNG'),
        el('button', { class: 'sk-action sk-primary', onClick: pickerOverlay }, '📓 הוסף למחברת')
      ])
    ]);
    root.appendChild(wrap);
    sizeCanvas();
  }

  if (window.App && App.register) App.register('sketch', renderView);
})();
