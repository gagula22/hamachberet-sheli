(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // העוזר החכם — ממשק (אחריות עצמאית). כפתור צף בכל מסך + פאנל צ׳אט,
  // וגם view מלא שנרשם ל-App ('assistant'). משתף לוגיקת צ׳אט אחת (makeChat).
  // משתמש ב-window.AsstEngine למענה; אינו נוגע בנתונים (קריאה בלבד דרך המנוע).
  // ─────────────────────────────────────────────────────────────────────────
  function el(tag, attrs, kids) { return App.el(tag, attrs || {}, kids || []); }

  var WELCOME = 'היי! אני העוזר של המחברת 🤖 — אני מכיר כל פיצ׳ר באתר: שאל "מה זה…", "איפה…" או "איך…", חפש בתוכן שלך, או בקש נתונים ("מה ההוצאות החודש?"). רוצה מבט-על? שאל "מה יש באתר".';
  var SUGGEST = ['מה יש באתר?', 'איך מפעילים מצב כהה?', 'איך עובד הגיבוי האוטומטי?', 'מה ההוצאות החודש?'];

  function go(route, open) {
    if (open && open.k) { try { sessionStorage.setItem(open.k, open.id); } catch (e) {} }
    if (route) location.hash = route;
  }
  function resultChip(r, onNav) {
    return el('button', { class: 'asst-result', onClick: function () { go(r.route, r.open); if (onNav) onNav(); } }, [
      el('span', { class: 'asst-result-icon' }, r.icon || '🔎'),
      el('span', { class: 'asst-result-body' }, [
        el('span', { class: 'asst-result-title' }, r.title || ''),
        r.sub ? el('span', { class: 'asst-result-sub' }, r.sub) : null
      ])
    ]);
  }

  // צ׳אט משותף: מחזיר { el, ask, focus }
  function makeChat(onNav) {
    var msgs = el('div', { class: 'asst-msgs' });
    function scroll() { msgs.scrollTop = msgs.scrollHeight; }
    function addMsg(who, parts) { msgs.appendChild(el('div', { class: 'asst-msg asst-' + who }, parts)); scroll(); }
    function bubble(t) { return el('div', { class: 'asst-bubble' }, t); }

    function ask(q) {
      q = (q || '').trim();
      if (!q) return;
      addMsg('user', [bubble(q)]);
      var res = (window.AsstEngine ? AsstEngine.answer(q) : { text: 'המנוע לא נטען.', results: [] });
      var parts = [bubble(res.text)];
      if (res.results && res.results.length) {
        parts.push(el('div', { class: 'asst-results' }, res.results.map(function (r) { return resultChip(r, onNav); })));
      }
      addMsg('bot', parts);
    }

    var input = el('input', { class: 'asst-input', type: 'text', placeholder: 'שאל אותי משהו…',
      onKeydown: function (e) { if (e.key === 'Enter') { var v = input.value; input.value = ''; ask(v); } } });
    var send = el('button', { class: 'asst-send', onClick: function () { var v = input.value; input.value = ''; ask(v); input.focus(); } }, 'שלח');

    addMsg('bot', [bubble(WELCOME),
      el('div', { class: 'asst-suggest' }, SUGGEST.map(function (s) {
        return el('button', { class: 'asst-sugg', onClick: function () { ask(s); } }, s);
      }))]);

    var wrap = el('div', { class: 'asst-chat' }, [msgs, el('div', { class: 'asst-inputbar' }, [input, send])]);
    return { el: wrap, ask: ask, focus: function () { setTimeout(function () { input.focus(); }, 60); } };
  }

  // ── פאנל צף ──────────────────────────────────────────────────────────────
  var _fab = null, _panel = null, _chat = null;

  function buildFab() {
    if (_fab || !document.body) return;
    _fab = el('button', { class: 'asst-fab', title: 'העוזר החכם', 'aria-label': 'העוזר החכם', onClick: toggle }, '💬');
    document.body.appendChild(_fab);
  }
  function openPanel() {
    if (_panel && document.body.contains(_panel)) { _panel.style.display = 'flex'; if (_chat) _chat.focus(); return; }
    _panel = null;  // stale/detached → rebuild fresh
    _chat = makeChat(closePanel);
    var head = el('div', { class: 'asst-head' }, [
      el('span', { class: 'asst-head-title' }, '🤖 העוזר של המחברת'),
      el('button', { class: 'asst-head-x', title: 'סגור', onClick: closePanel }, '✕')
    ]);
    _panel = el('div', { class: 'asst-panel' }, [head, _chat.el]);
    document.body.appendChild(_panel);
    if (_fab) _fab.classList.add('open');
    _chat.focus();
  }
  function closePanel() { if (_panel) _panel.style.display = 'none'; if (_fab) _fab.classList.remove('open'); }
  function toggle() { if (_panel && _panel.style.display !== 'none') closePanel(); else openPanel(); }

  // ── view מלא (מופיע גם בסרגל הצד) ────────────────────────────────────────
  function renderView(root) {
    var chat = makeChat(null);
    root.appendChild(el('div', { class: 'card asst-view-card' }, [
      el('h2', { class: 'asst-view-title' }, '🤖 העוזר של המחברת'),
      el('div', { class: 'asst-view-sub' }, 'שאל בשפה חופשית על האתר או על התוכן שלך — הכול נשאר במחשב שלך.'),
      chat.el
    ]));
    chat.focus();
  }

  if (window.App && App.register) App.register('assistant', renderView);
  buildFab();

  window.Assistant = {
    open: openPanel, close: closePanel, toggle: toggle,
    ask: function (q) { openPanel(); if (_chat) _chat.ask(q); }
  };
})();
