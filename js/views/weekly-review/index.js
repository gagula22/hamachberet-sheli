(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // סקירה שבועית מודרכת — אחריות עצמאית (בהשראת Sunsama).
  // v3 לפי משוב המשתמש:
  //   • שלושה שדות רפלקציה עשירים (HTML + תמונות בהדבקה/כפתור, דרך
  //     window.Editable — אותה תשתית של ההערות): מה הלך טוב / מה לא הלך
  //     טוב / מה לשפר.
  //   • שמירה יוצרת רשומה שבועית שמופיעה מיד ב"ארכיון הסקירות" למטה —
  //     כרטיס לכל שבוע.
  //   • ארכיון עם חיפוש לפי מילת מפתח + סינון לפי שדה ("הצג לי את כל
  //     מה שהלך טוב").
  // נתונים: weeklyReviews = { '<תחילת-שבוע>': {good, bad, improve, savedAt} }
  // (good/bad/improve = HTML; רשומות ישנות בטקסט פשוט נתמכות בתצוגה).
  // העברת משימות-יומן פתוחות +7 ימים — פעולת משתמש מפורשת (כתיבה ל-tasks).
  // ⚠️ Store.dateKey הוא UTC — חישובי תאריך מעוגנים ל-T12:00:00.
  // ─────────────────────────────────────────────────────────────────────────

  function el(t, a, k) { return App.el(t, a || {}, k || []); }

  var FIELDS = [
    { key: 'good',    label: 'מה הלך טוב?',     icon: '👍', chip: 'מה הלך טוב' },
    { key: 'bad',     label: 'מה לא הלך טוב?',  icon: '👎', chip: 'מה לא הלך טוב' },
    { key: 'improve', label: 'מה לשפר?',        icon: '🔧', chip: 'מה לשפר' }
  ];

  // ── תאריכים ───────────────────────────────────────────────────────────────
  function weekStart(offsetWeeks) {
    var d = new Date();
    d.setDate(d.getDate() - d.getDay() + (offsetWeeks || 0) * 7);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function weekKey() { return Store.dateKey(new Date(weekStart(0).getTime() + 12 * 3600 * 1000)); }
  function inWeek(dateStr, start) {
    if (!dateStr) return false;
    var end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    var d = new Date(dateStr + 'T12:00:00');
    return d >= start && d < end;
  }
  function fmtRange(start) {
    var end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    var f = function (x) { return x.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }); };
    return f(start) + ' – ' + f(end);
  }
  function fmtRangeFromKey(k) {
    return fmtRange(new Date(k + 'T12:00:00'));
  }

  function reviews() { return Store.get('weeklyReviews') || {}; }

  // ── רינדור תוכן שמור (HTML חדש או טקסט ישן) ──────────────────────────────
  function contentNode(value) {
    var box = el('div', { class: 'wr-content' });
    if (!value) return box;
    if (/<[a-z][\s\S]*>/i.test(value)) box.innerHTML = value;
    else box.textContent = value;
    return box;
  }
  function plainText(value) {
    if (!value) return '';
    if (!/<[a-z]/i.test(value)) return value;
    var d = document.createElement('div');
    d.innerHTML = value;
    return d.textContent || '';
  }
  function hasContent(value) {
    return !!(value && (plainText(value).trim() || value.indexOf('<img') > -1));
  }

  // ── שדה רפלקציה עשיר ─────────────────────────────────────────────────────
  // onChange (אופציונלי): נקרא בכל הקלדה/הדבקת-תמונה — מזין את השמירה האוטומטית.
  function richField(def, initial, onChange) {
    var ed = el('div', { class: 'wr-rich', contenteditable: 'true', 'data-placeholder': 'כתוב כאן… (אפשר להדביק תמונות עם Ctrl+V)' });
    if (initial) {
      if (/<[a-z][\s\S]*>/i.test(initial)) ed.innerHTML = initial;
      else ed.textContent = initial;
    }
    var notify = onChange || function () {};
    ed.addEventListener('input', notify);
    if (window.Editable && Editable.attachImageBehaviors) {
      Editable.attachImageBehaviors(ed, notify);
    }
    var file = el('input', { type: 'file', accept: 'image/*', multiple: true, style: { display: 'none' } });
    file.addEventListener('change', function (e) {
      Array.from(e.target.files || []).forEach(function (f) {
        if (window.Editable && Editable.insertImageFromFile) Editable.insertImageFromFile(f, ed, notify);
      });
      file.value = '';
    });
    var head = el('div', { class: 'wr-field-head' }, [
      el('label', { class: 'wr-label' }, def.icon + ' ' + def.label),
      el('button', { class: 'wr-img-btn', title: 'הוסף תמונה', onClick: function () { file.click(); } }, '🖼️')
    ]);
    return { wrap: el('div', { class: 'wr-field' }, [head, ed, file]), editor: ed };
  }

  // ── שמירה אוטומטית ────────────────────────────────────────────────────────
  // כל הקלדה/הדבקה בשדות נשמרת לבד אחרי 0.7 שניות שקט (כמו במחברת) —
  // כפתור "שמור סקירה" נשאר לאישור מפורש ולרענון הארכיון.
  function makeAutosave(weekKeyStr, editors, statusEl) {
    function doSave() {
      var all = Object.assign({}, reviews());
      all[weekKeyStr] = {
        good: editors.good.innerHTML,
        bad: editors.bad.innerHTML,
        improve: editors.improve.innerHTML,
        savedAt: Date.now()
      };
      Store.set('weeklyReviews', all);
      if (statusEl) {
        statusEl.textContent = '✓ נשמר אוטומטית';
        statusEl.classList.add('show');
        clearTimeout(statusEl._t);
        statusEl._t = setTimeout(function () { statusEl.classList.remove('show'); }, 1800);
      }
    }
    return (window.EditableUtils && EditableUtils.debounce) ? EditableUtils.debounce(doSave, 700) : doSave;
  }

  // ── מסך ───────────────────────────────────────────────────────────────────
  var _query = '', _fieldFilter = 'all';
  var _expanded = {};   // weekKey → true כשמורחב (ברירת מחדל: מצומצם)
  var _editing = null;  // weekKey שנמצא בעריכה בתוך הארכיון

  function renderView(root) {
    function rerender() { root.innerHTML = ''; build(); }
    function build() {
      var start = weekStart(0);
      var key = weekKey();
      var saved = reviews()[key] || {};

      // ── 1. סיכום השבוע ──
      var tasks = Store.get('tasks') || [];
      var weekTasks = tasks.filter(function (t) { return inWeek(t.date, start); });
      var doneWeek = weekTasks.filter(function (t) { return t.done; });
      var openWeek = weekTasks.filter(function (t) { return !t.done; });
      var doneTodos = (Store.get('todos') || []).filter(function (t) { return t.done; });
      var habits = Store.get('habits') || [];
      var habitChecks = 0;
      habits.forEach(function (h) {
        for (var i = 0; i < 7; i++) {
          var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
          if (h.log && h.log[Store.dateKey(new Date(d.getTime() + 12 * 3600 * 1000))]) habitChecks++;
        }
      });
      root.appendChild(el('div', { class: 'card wr-head' }, [
        el('h2', {}, '🧭 סקירה שבועית — ' + fmtRange(start)),
        el('div', { class: 'wr-stats' }, [
          el('div', { class: 'wr-stat' }, [el('b', {}, String(doneWeek.length)), el('span', {}, 'משימות-יומן הושלמו')]),
          el('div', { class: 'wr-stat' }, [el('b', {}, String(doneTodos.length)), el('span', {}, 'משימות ✓ ברשימה')]),
          el('div', { class: 'wr-stat' }, [el('b', {}, String(habitChecks)), el('span', {}, 'סימוני הרגלים')])
        ]),
        saved.savedAt ? el('div', { class: 'wr-saved-note' }, '✓ הסקירה של השבוע נשמרה — מופיעה בארכיון למטה. אפשר לערוך ולשמור שוב.') : null
      ]));

      // ── 2. רפלקציה (שלושה שדות עשירים, שמירה אוטומטית) ──
      var editors = {};
      var autoStatus = el('span', { class: 'wr-autosave' });
      var autosave = makeAutosave(key, editors, autoStatus);
      var refCard = el('div', { class: 'card' }, [el('h2', { class: 'wr-h' }, '✍️ רפלקציה')]);
      FIELDS.forEach(function (def) {
        var f = richField(def, saved[def.key], autosave);
        editors[def.key] = f.editor;
        refCard.appendChild(f.wrap);
      });
      refCard.appendChild(el('div', { class: 'wr-save-row' }, [
        el('button', { class: 'wr-save', onClick: function () {
          var all = Object.assign({}, reviews());
          all[key] = {
            good: editors.good.innerHTML,
            bad: editors.bad.innerHTML,
            improve: editors.improve.innerHTML,
            savedAt: Date.now()
          };
          Store.set('weeklyReviews', all);
          App.toast('🧭 הסקירה נשמרה — נוספה לארכיון');
          rerender();
        } }, '💾 שמור סקירה'),
        autoStatus
      ]));
      root.appendChild(refCard);

      // ── 3. משימות פתוחות → שבוע הבא ──
      if (openWeek.length) {
        var checks = [];
        var moveCard = el('div', { class: 'card' }, [
          el('h2', { class: 'wr-h' }, '📤 משימות-יומן שלא הושלמו (' + openWeek.length + ')'),
          el('div', { class: 'wr-sub' }, 'סמן אילו להעביר לשבוע הבא (אותו יום, שבוע קדימה):')
        ]);
        openWeek.forEach(function (t) {
          var cb = el('input', { type: 'checkbox', checked: true });
          checks.push({ cb: cb, task: t });
          moveCard.appendChild(el('label', { class: 'wr-task' }, [cb, el('span', {}, t.text + ' (' + t.date + ')')]));
        });
        moveCard.appendChild(el('button', { class: 'wr-move', onClick: function () {
          var ids = {};
          checks.forEach(function (c) { if (c.cb.checked) ids[c.task.id] = 1; });
          var n = Object.keys(ids).length;
          if (!n) { App.toast('לא נבחרו משימות'); return; }
          Store.update('tasks', function (list) {
            return list.map(function (t) {
              if (!ids[t.id]) return t;
              var d = new Date(t.date + 'T12:00:00');
              d.setDate(d.getDate() + 7);
              return Object.assign({}, t, { date: Store.dateKey(d) });
            });
          });
          App.toast('📤 ' + n + ' משימות הועברו לשבוע הבא');
          rerender();
        } }, 'העבר את המסומנות לשבוע הבא'));
        root.appendChild(moveCard);
      }

      // ── 4. ארכיון הסקירות: חיפוש + סינון לפי שדה ──
      var allKeys = Object.keys(reviews()).sort().reverse();
      if (allKeys.length) {
        var search = el('input', {
          class: 'input wr-search', type: 'text', value: _query,
          placeholder: 'חיפוש בכל הסקירות לפי מילת מפתח…',
          onInput: function (e) {
            _query = e.target.value;
            drawArchive();
          }
        });
        var chips = el('div', { class: 'wr-chips' });
        [{ k: 'all', label: 'הכול' }].concat(FIELDS.map(function (f) { return { k: f.key, label: f.icon + ' ' + f.chip }; }))
          .forEach(function (c) {
            var btn = el('button', {
              class: 'tab' + (_fieldFilter === c.k ? ' active' : ''),
              onClick: function () {
                _fieldFilter = c.k;
                chips.querySelectorAll('.tab').forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
                drawArchive();
              }
            }, c.label);
            chips.appendChild(btn);
          });
        var archList = el('div', { class: 'wr-archive' });
        var archCard = el('div', { class: 'card' }, [
          el('h2', { class: 'wr-h' }, '🗂️ ארכיון הסקירות (' + allKeys.length + ' שבועות)'),
          search, el('div', { class: 'tabs wr-chip-row' }, [chips]), archList
        ]);

        // כרטיס שבוע: מצומצם (ברירת מחדל, עם תקציר) ⇄ מורחב ⇄ עריכה-במקום
        function weekCard(k, r, fields, rerenderAll) {
          var isCur = k === key;
          var title = '📅 שבוע ' + fmtRangeFromKey(k) + (isCur ? ' (השבוע הנוכחי)' : '');

          // ── מצב עריכה (עם שמירה אוטומטית) ──
          if (_editing === k) {
            var editors = {};
            var autoStatus = el('span', { class: 'wr-autosave' });
            var autosave = makeAutosave(k, editors, autoStatus);
            var block = el('div', { class: 'wr-week editing' + (isCur ? ' current' : '') }, [
              el('div', { class: 'wr-week-title' }, '✏️ עריכת ' + title)
            ]);
            FIELDS.forEach(function (def) {
              var f = richField(def, r[def.key], autosave);
              editors[def.key] = f.editor;
              block.appendChild(f.wrap);
            });
            block.appendChild(el('div', { class: 'wr-card-actions' }, [
              el('button', { class: 'wr-save', onClick: function () {
                var all = Object.assign({}, reviews());
                all[k] = { good: editors.good.innerHTML, bad: editors.bad.innerHTML, improve: editors.improve.innerHTML, savedAt: Date.now() };
                Store.set('weeklyReviews', all);
                _editing = null;
                App.toast('💾 השבוע עודכן');
                rerenderAll();
              } }, '💾 שמור וסגור'),
              el('button', { class: 'wr-mini-btn', onClick: function () { _editing = null; drawArchive(); } }, 'סגור'),
              autoStatus
            ]));
            return block;
          }

          // ── כותרת + כפתורי פעולה ──
          var expanded = !!_expanded[k];
          var actions = el('div', { class: 'wr-card-btns' }, [
            el('button', { class: 'wr-mini-btn', onClick: function () { _expanded[k] = !expanded; drawArchive(); } },
              expanded ? '⤡ צמצם' : '🔍 הגדל'),
            el('button', { class: 'wr-mini-btn', onClick: function () { _editing = k; _expanded[k] = false; drawArchive(); } }, '✏️ עריכה')
          ]);
          var block2 = el('div', { class: 'wr-week' + (isCur ? ' current' : '') }, [
            el('div', { class: 'wr-week-head' }, [el('div', { class: 'wr-week-title' }, title), actions])
          ]);

          if (expanded) {
            fields.forEach(function (f) {
              block2.appendChild(el('div', { class: 'wr-entry' }, [
                el('div', { class: 'wr-entry-label' }, f.icon + ' ' + f.chip),
                contentNode(r[f.key])
              ]));
            });
          } else {
            // תקציר: שורה לכל שדה — טקסט קצוץ + סימון 🖼️ אם יש תמונה
            fields.forEach(function (f) {
              var txt = plainText(r[f.key]).replace(/\s+/g, ' ').trim();
              var hasImg = (r[f.key] || '').indexOf('<img') > -1;
              block2.appendChild(el('div', { class: 'wr-preview' }, [
                el('span', { class: 'wr-preview-label' }, f.icon),
                el('span', { class: 'wr-preview-text' },
                  (txt ? (txt.length > 90 ? txt.slice(0, 90) + '…' : txt) : '') + (hasImg ? ' 🖼️' : ''))
              ]));
            });
          }
          return block2;
        }

        function drawArchive() {
          archList.innerHTML = '';
          var q = _query.trim();
          var shown = 0;
          allKeys.forEach(function (k) {
            var r = reviews()[k];
            var fields = FIELDS.filter(function (f) {
              if (_fieldFilter !== 'all' && f.key !== _fieldFilter) return false;
              if (!hasContent(r[f.key])) return false;
              if (q && plainText(r[f.key]).indexOf(q) === -1) return false;
              return true;
            });
            if (!fields.length && _editing !== k) return;
            shown++;
            archList.appendChild(weekCard(k, r, fields, rerender));
          });
          if (!shown) archList.appendChild(el('div', { class: 'wr-none' }, q ? 'אין תוצאות ל"' + q + '"' : 'אין עדיין תוכן בסינון הזה.'));
        }
        drawArchive();
        root.appendChild(archCard);
      }
    }
    build();
  }

  if (window.App && App.register) App.register('weekly-review', renderView);
})();
