(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // "ביום הזה לפני…" — אחריות עצמאית (בהשראת Daylio).
  // כרטיס בלוח הבקרה (window.DASHBOARD_WIDGETS) שמציג מה תיעדת לפני
  // שבוע / חודש / שנה: מצב רוח + רפלקציה, הערות ונושאים שנערכו באותו יום.
  // קריאה בלבד מה-Store; אם אין כלום — הכרטיס פשוט לא מופיע.
  // ─────────────────────────────────────────────────────────────────────────

  function el(t, a, k) { return App.el(t, a || {}, k || []); }
  var MOOD_EMOJI = { 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' };

  function ago(days) {
    var d = new Date();
    d.setDate(d.getDate() - days);
    return d;
  }
  function sameDay(ts, d) {
    if (!ts) return false;
    var x = new Date(ts);
    return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() && x.getDate() === d.getDate();
  }

  function lookback(label, days) {
    var d = ago(days);
    var key = Store.dateKey(d);
    var items = [];

    var mood = Store.get('mood') || {};
    if (mood[key]) {
      var note = mood[key + ':note'];
      items.push(el('div', { class: 'otd-item' }, [
        el('span', { class: 'otd-icon' }, MOOD_EMOJI[mood[key]] || '💭'),
        el('span', {}, note ? '"' + (note.length > 70 ? note.slice(0, 70) + '…' : note) + '"' : 'תיעדת מצב רוח')
      ]));
    }
    (Store.get('notes') || []).forEach(function (n) {
      if (sameDay(n.updatedAt, d)) {
        items.push(el('button', {
          class: 'otd-item otd-link',
          onClick: function () { try { sessionStorage.setItem('openNoteId', n.id); } catch (e) {} location.hash = '#/notes'; }
        }, [el('span', { class: 'otd-icon' }, '📝'), el('span', {}, n.title || '(הערה)')]));
      }
    });
    (Store.get('topics') || []).forEach(function (t) {
      if (sameDay(t.updatedAt, d)) {
        items.push(el('button', {
          class: 'otd-item otd-link',
          onClick: function () { if (window.TopicOpen) TopicOpen.open(t.id, t.name); }
        }, [el('span', { class: 'otd-icon' }, '📓'), el('span', {}, t.name || '(נושא)')]));
      }
    });

    if (!items.length) return null;
    return el('div', { class: 'otd-block' }, [el('div', { class: 'otd-when' }, label), el('div', { class: 'otd-items' }, items.slice(0, 4))]);
  }

  function renderCard() {
    var blocks = [
      lookback('לפני שבוע', 7),
      lookback('לפני חודש', 30),
      lookback('לפני שנה', 365)
    ].filter(Boolean);
    if (!blocks.length) return null;
    return el('div', { class: 'card otd-card' }, [el('h2', { class: 'otd-title' }, '🗓️ ביום הזה לפני…')].concat(blocks));
  }

  (window.DASHBOARD_WIDGETS = window.DASHBOARD_WIDGETS || []).push(renderCard);
})();
