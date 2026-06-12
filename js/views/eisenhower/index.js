(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // מטריצת אייזנהאואר — אחריות עצמאית (בהשראת TickTick).
  // המשימות הקיימות (todos) מוצגות בארבעה רבעים לפי דחיפות/חשיבות + מגירת
  // "ללא שיוך". השיוך נשמר במפתח נתונים משלנו (eisenhower: { todoId: q }).
  // גרירה בין רבעים. כתיבה ל-todos נעשית רק לפעולת המשתמש המפורשת של
  // סימון-בוצע (חריגה מתועדת — זו מהות המסך).
  // ─────────────────────────────────────────────────────────────────────────

  function el(t, a, k) { return App.el(t, a || {}, k || []); }

  var QUADS = [
    { q: 'q1', title: 'דחוף וחשוב', sub: 'עשה עכשיו', color: 'blush' },
    { q: 'q2', title: 'חשוב, לא דחוף', sub: 'תזמן לזה זמן', color: 'sage' },
    { q: 'q3', title: 'דחוף, לא חשוב', sub: 'צמצם / האצל', color: 'butter' },
    { q: 'q4', title: 'לא דחוף ולא חשוב', sub: 'שקול לוותר', color: 'lavender' }
  ];

  function assignments() { return Store.get('eisenhower') || {}; }
  function setAssign(todoId, q) {
    var a = Object.assign({}, assignments());
    if (q) a[todoId] = q; else delete a[todoId];
    Store.set('eisenhower', a);
  }
  function cleanup(todos) {
    // הסרת שיוכים של משימות שכבר לא קיימות
    var ids = {}, a = assignments(), changed = false, out = {};
    todos.forEach(function (t) { ids[t.id] = 1; });
    Object.keys(a).forEach(function (k) { if (ids[k]) out[k] = a[k]; else changed = true; });
    if (changed) Store.set('eisenhower', out);
    return out;
  }

  function pill(todo, rerender) {
    var p = el('div', { class: 'eh-pill' + (todo.done ? ' done' : ''), draggable: 'true' }, [
      el('button', {
        class: 'checkbox' + (todo.done ? ' checked' : ''),
        onClick: function () {
          // פעולת משתמש מפורשת על המשימה עצמה — עדכון ב-todos
          Store.update('todos', function (list) {
            return list.map(function (t) { return t.id === todo.id ? Object.assign({}, t, { done: !t.done }) : t; });
          });
          rerender();
        }
      }),
      el('span', { class: 'eh-text' }, todo.text)
    ]);
    p.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/plain', todo.id);
      e.dataTransfer.effectAllowed = 'move';
      p.classList.add('dragging');
    });
    p.addEventListener('dragend', function () { p.classList.remove('dragging'); });
    return p;
  }

  function dropZone(node, q, rerender) {
    node.addEventListener('dragover', function (e) { e.preventDefault(); node.classList.add('drag-over'); });
    node.addEventListener('dragleave', function () { node.classList.remove('drag-over'); });
    node.addEventListener('drop', function (e) {
      e.preventDefault();
      node.classList.remove('drag-over');
      var id = e.dataTransfer.getData('text/plain');
      if (id) { setAssign(id, q); rerender(); }
    });
  }

  function renderView(root) {
    function rerender() { root.innerHTML = ''; build(); }
    function build() {
      var todos = (Store.get('todos') || []).filter(function (t) { return !t.done; });
      var doneTodos = (Store.get('todos') || []).filter(function (t) { return t.done; });
      var a = cleanup(Store.get('todos') || []);

      var grid = el('div', { class: 'eh-grid' });
      QUADS.forEach(function (def) {
        var inQuad = todos.filter(function (t) { return a[t.id] === def.q; });
        var col = el('div', { class: 'eh-quad eh-' + def.q }, [
          el('div', { class: 'eh-quad-head' }, [
            el('span', { class: 'eh-quad-title' }, def.title),
            el('span', { class: 'eh-quad-sub' }, def.sub)
          ]),
          el('div', { class: 'eh-quad-body' },
            inQuad.length ? inQuad.map(function (t) { return pill(t, rerender); }) : [el('div', { class: 'eh-hint' }, 'גרור משימות לכאן')])
        ]);
        col.style.background = 'var(--' + def.color + ')';
        dropZone(col, def.q, rerender);
        grid.appendChild(col);
      });

      var unassigned = todos.filter(function (t) { return !a[t.id]; });
      var tray = el('div', { class: 'card eh-tray' }, [
        el('div', { class: 'eh-tray-head' }, '📥 משימות ללא שיוך (' + unassigned.length + ') — גרור אותן לרבע המתאים'),
        el('div', { class: 'eh-tray-body' },
          unassigned.length ? unassigned.map(function (t) { return pill(t, rerender); })
            : [el('div', { class: 'eh-hint' }, doneTodos.length || todos.length ? 'כל המשימות הפתוחות שויכו 🎯' : 'אין משימות פתוחות — הוסף במסך המשימות')])
      ]);
      dropZone(tray, null, rerender);

      root.appendChild(el('div', { class: 'card eh-head' }, [
        el('h2', {}, '🎯 מטריצת סדר יום'),
        el('div', { class: 'eh-sub' }, 'שיטת אייזנהאואר: מה שדחוף וחשוב — עכשיו; מה שחשוב — בתכנון; השאר — בספק.')
      ]));
      root.appendChild(grid);
      root.appendChild(tray);
    }
    build();
  }

  if (window.App && App.register) App.register('eisenhower', renderView);
})();
