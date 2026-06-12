(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // רשימת קריאה — אחריות עצמאית (בהשראת Pocket).
  // שמירת קישורים (מאמרים/סרטונים) עם כותרת, תגית וסטטוס נקרא/לא-נקרא.
  // מפתח נתונים משלה: readingList (subcol — מסתנכרן פר-פריט באתר החי).
  // ─────────────────────────────────────────────────────────────────────────

  function el(t, a, k) { return App.el(t, a || {}, k || []); }
  var _filter = 'unread';   // unread | read | all

  function items() { return Store.get('readingList') || []; }
  function save(list) { Store.set('readingList', list); }

  function normalizeUrl(u) {
    u = (u || '').trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    return u;
  }
  function hostOf(u) {
    try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  }

  function addForm(rerender) {
    var url = el('input', { class: 'input', type: 'text', placeholder: 'הדבק קישור (כתובת אתר)…' });
    var title = el('input', { class: 'input', type: 'text', placeholder: 'כותרת (לא חובה)' });
    var tag = el('input', { class: 'input rl-tag-input', type: 'text', placeholder: 'תגית' });
    function add() {
      var u = normalizeUrl(url.value);
      if (!u) { App.toast('הדבק קישור קודם'); return; }
      save(items().concat([{
        id: Store.uid(), url: u,
        title: title.value.trim() || hostOf(u) || u,
        tag: tag.value.trim(), read: false, createdAt: Date.now()
      }]));
      url.value = title.value = tag.value = '';
      App.toast('🔖 נשמר לרשימת הקריאה');
      rerender();
    }
    [url, title, tag].forEach(function (i) {
      i.addEventListener('keydown', function (e) { if (e.key === 'Enter') add(); });
    });
    return el('div', { class: 'card rl-form' }, [
      el('h2', {}, '🔖 רשימת קריאה'),
      el('div', { class: 'rl-form-row' }, [url, title, tag, el('button', { class: 'rl-add', onClick: add }, '+ שמור')])
    ]);
  }

  function row(item, rerender) {
    return el('div', { class: 'rl-row' + (item.read ? ' read' : '') }, [
      el('button', {
        class: 'checkbox' + (item.read ? ' checked' : ''), title: item.read ? 'סמן כלא-נקרא' : 'סמן כנקרא',
        onClick: function () {
          save(items().map(function (x) { return x.id === item.id ? Object.assign({}, x, { read: !x.read }) : x; }));
          rerender();
        }
      }),
      el('a', { class: 'rl-body', href: item.url, target: '_blank', rel: 'noopener' }, [
        el('span', { class: 'rl-title' }, item.title),
        el('span', { class: 'rl-meta' }, hostOf(item.url) + (item.tag ? ' · #' + item.tag : ''))
      ]),
      el('button', { class: 'rl-del', title: 'מחיקה', onClick: function () {
        save(items().filter(function (x) { return x.id !== item.id; }));
        rerender();
      } }, '✕')
    ]);
  }

  function renderView(root) {
    function rerender() { root.innerHTML = ''; build(); }
    function build() {
      root.appendChild(addForm(rerender));
      var list = items().slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
      var unreadCount = list.filter(function (x) { return !x.read; }).length;
      var tabs = el('div', { class: 'tabs rl-tabs' }, [
        ['unread', 'לקריאה (' + unreadCount + ')'], ['read', 'נקראו'], ['all', 'הכול']
      ].map(function (t) {
        return el('button', { class: 'tab' + (_filter === t[0] ? ' active' : ''), onClick: function () { _filter = t[0]; rerender(); } }, t[1]);
      }));
      var shown = list.filter(function (x) {
        return _filter === 'all' ? true : _filter === 'read' ? x.read : !x.read;
      });
      var card = el('div', { class: 'card' }, [tabs]);
      if (!shown.length) {
        card.appendChild(el('div', { class: 'rl-empty' }, _filter === 'unread' ? 'אין פריטים שמחכים לקריאה 🎉' : 'אין פריטים כאן.'));
      } else {
        card.appendChild(el('div', { class: 'rl-list' }, shown.map(function (x) { return row(x, rerender); })));
      }
      root.appendChild(card);
    }
    build();
  }

  if (window.App && App.register) App.register('readinglist', renderView);
})();
