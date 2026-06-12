(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // כרטיסיות זיכרון עם חזרה מרווחת — אחריות עצמאית (בהשראת Anki).
  // כרטיסיה: { id, q, a, topicId?, interval, due:'YYYY-MM-DD', reps, lapses }.
  // אלגוריתם מרווחים גדלים פשוט וחסין:
  //   לא ידעתי → מחר (interval=1)
  //   ידעתי   → 1→3→7→15→30→60→120 ימים
  // מפתח נתונים משלה: flashcards (subcol). קישור אופציונלי לנושא במחברת.
  // ─────────────────────────────────────────────────────────────────────────

  function el(t, a, k) { return App.el(t, a || {}, k || []); }
  var STEPS = [1, 3, 7, 15, 30, 60, 120];

  function cards() { return Store.get('flashcards') || []; }
  function save(list) { Store.set('flashcards', list); }
  function today() { return Store.todayKey(); }
  function addDays(n) {
    var d = new Date();
    d.setDate(d.getDate() + n);
    return Store.dateKey(d);
  }
  function dueCards() {
    var t = today();
    return cards().filter(function (c) { return !c.due || c.due <= t; });
  }
  function nextInterval(cur) {
    for (var i = 0; i < STEPS.length; i++) { if (STEPS[i] > cur) return STEPS[i]; }
    return STEPS[STEPS.length - 1];
  }

  function grade(card, knew) {
    var interval = knew ? nextInterval(card.interval || 0) : 1;
    save(cards().map(function (c) {
      return c.id === card.id ? Object.assign({}, c, {
        interval: interval,
        due: addDays(interval),
        reps: (c.reps || 0) + 1,
        lapses: (c.lapses || 0) + (knew ? 0 : 1)
      }) : c;
    }));
  }

  // ── מסך תרגול ─────────────────────────────────────────────────────────────
  function reviewUI(rerender) {
    var queue = dueCards();
    if (!queue.length) {
      return el('div', { class: 'card fc-done' }, [
        el('div', { class: 'fc-done-big' }, '🎉'),
        el('div', {}, 'אין כרטיסיות לחזרה היום. ' + (cards().length ? 'החזרה הבאה תופיע כשיגיע זמנה.' : 'צור כרטיסיה ראשונה למטה.'))
      ]);
    }
    var idx = 0, showAnswer = false;
    var box = el('div', { class: 'card fc-review' });
    function draw() {
      box.innerHTML = '';
      if (idx >= queue.length) { rerender(); return; }
      var c = queue[idx];
      box.appendChild(el('div', { class: 'fc-progress' }, 'כרטיסיה ' + (idx + 1) + ' מתוך ' + queue.length));
      box.appendChild(el('div', { class: 'fc-q' }, c.q));
      if (!showAnswer) {
        box.appendChild(el('button', { class: 'fc-flip', onClick: function () { showAnswer = true; draw(); } }, 'הצג תשובה'));
      } else {
        box.appendChild(el('div', { class: 'fc-a' }, c.a));
        if (c.topicId) {
          box.appendChild(el('button', { class: 'fc-src', onClick: function () { if (window.TopicOpen) TopicOpen.open(c.topicId); } }, '📓 פתח את הנושא במחברת'));
        }
        box.appendChild(el('div', { class: 'fc-grade' }, [
          el('button', { class: 'fc-no', onClick: function () { grade(c, false); idx++; showAnswer = false; draw(); } }, '❌ לא ידעתי (מחר)'),
          el('button', { class: 'fc-yes', onClick: function () { grade(c, true); idx++; showAnswer = false; draw(); } },
            '✓ ידעתי (עוד ' + nextInterval(c.interval || 0) + ' ימים)')
        ]));
      }
    }
    draw();
    return box;
  }

  // ── יצירה וניהול ──────────────────────────────────────────────────────────
  function createUI(rerender) {
    var q = el('textarea', { class: 'textarea fc-input', rows: '2', placeholder: 'שאלה (הצד הקדמי)…' });
    var a = el('textarea', { class: 'textarea fc-input', rows: '2', placeholder: 'תשובה (הצד האחורי)…' });
    var topicSel = el('select', { class: 'input fc-topic' }, [el('option', { value: '' }, 'בלי קישור לנושא')]);
    ((window.nbTree && nbTree.getTopics()) || Store.get('topics') || []).forEach(function (t) {
      topicSel.appendChild(el('option', { value: t.id }, t.name || '(נושא)'));
    });
    return el('div', { class: 'card' }, [
      el('h2', { class: 'fc-h' }, '➕ כרטיסיה חדשה'),
      q, a,
      el('div', { class: 'fc-new-row' }, [
        topicSel,
        el('button', { class: 'fc-add', onClick: function () {
          if (!q.value.trim() || !a.value.trim()) { App.toast('מלא שאלה ותשובה'); return; }
          save(cards().concat([{ id: Store.uid(), q: q.value.trim(), a: a.value.trim(), topicId: topicSel.value || null, interval: 0, due: today(), reps: 0, lapses: 0 }]));
          App.toast('🧠 הכרטיסיה נוצרה — מופיעה בתרגול של היום');
          rerender();
        } }, 'צור כרטיסיה')
      ])
    ]);
  }

  function listUI(rerender) {
    var all = cards();
    if (!all.length) return null;
    var card = el('div', { class: 'card' }, [el('h2', { class: 'fc-h' }, '🗂️ כל הכרטיסיות (' + all.length + ')')]);
    all.forEach(function (c) {
      card.appendChild(el('div', { class: 'fc-row' }, [
        el('div', { class: 'fc-row-body' }, [
          el('span', { class: 'fc-row-q' }, c.q),
          el('span', { class: 'fc-row-meta' }, 'חזרה הבאה: ' + (c.due || today()) + ' · חזרות: ' + (c.reps || 0))
        ]),
        el('button', { class: 'fc-del', title: 'מחיקה', onClick: function () {
          if (confirm('למחוק את הכרטיסיה?')) { save(all.filter(function (x) { return x.id !== c.id; })); rerender(); }
        } }, '✕')
      ]));
    });
    return card;
  }

  function renderView(root) {
    function rerender() { root.innerHTML = ''; build(); }
    function build() {
      var due = dueCards().length;
      root.appendChild(el('div', { class: 'card fc-head' }, [
        el('h2', {}, '🧠 כרטיסיות זיכרון'),
        el('div', { class: 'fc-sub' }, 'חזרה מרווחת: כל תשובה נכונה מרחיקה את החזרה הבאה (1→3→7→15→30 ימים) — כך זוכרים לטווח ארוך. ' + (due ? 'מחכות לך ' + due + ' כרטיסיות להיום.' : ''))
      ]));
      root.appendChild(reviewUI(rerender));
      root.appendChild(createUI(rerender));
      var l = listUI(rerender);
      if (l) root.appendChild(l);
    }
    build();
  }

  if (window.App && App.register) App.register('flashcards', renderView);
})();
