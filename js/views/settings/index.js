(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // מסך הגדרות — אחריות עצמאית.
  // כרטיסים מובנים: שם משתמש (מזין את הברכה הקיימת ב-app.js, שכבר קוראת
  // settings.userName), ערכת נושא (דרך window.Theme), גודל טקסט.
  // הרחבה: מודולים אחרים יכולים לרשום כרטיס משלהם דרך window.SETTINGS_CARDS
  // (מנגנון זהה ל-window.DASHBOARD_WIDGETS — מערך פונקציות רינדור).
  // ─────────────────────────────────────────────────────────────────────────

  window.SETTINGS_CARDS = window.SETTINGS_CARDS || [];

  function el(tag, attrs, kids) { return App.el(tag, attrs || {}, kids || []); }

  function card(title, sub, body) {
    return el('div', { class: 'card settings-card' }, [
      el('h2', { class: 'settings-card-title' }, title),
      sub ? el('div', { class: 'settings-card-sub' }, sub) : null,
      body
    ]);
  }

  // ── שם משתמש ──────────────────────────────────────────────────────────────
  function nameCard() {
    var s = Store.get('settings') || {};
    var t = null;
    var input = el('input', {
      class: 'input settings-name-input', type: 'text',
      value: s.userName || '', placeholder: 'איך לקרוא לך?',
      onInput: function (e) {
        clearTimeout(t);
        var v = e.target.value;
        t = setTimeout(function () {
          var st = Object.assign({}, Store.get('settings') || {});
          st.userName = v.trim();
          Store.set('settings', st);
        }, 300);
      }
    });
    return card('👤 השם שלך', 'מופיע בברכה שבלוח הבקרה', input);
  }

  // ── בורר אפשרויות כללי (ערכה / גודל) ─────────────────────────────────────
  function optionRow(options, isActive, onPick) {
    var row = el('div', { class: 'settings-options' });
    options.forEach(function (o) {
      var btn = el('button', {
        class: 'settings-opt' + (isActive(o.value) ? ' active' : ''),
        onClick: function () {
          onPick(o.value);
          row.querySelectorAll('.settings-opt').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
        }
      }, [
        el('span', { class: 'settings-opt-icon' }, o.icon),
        el('span', {}, o.label)
      ]);
      row.appendChild(btn);
    });
    return row;
  }

  function themeCard() {
    var row = optionRow(
      [
        { value: 'cream', icon: '☀️', label: 'בהיר' },
        { value: 'dark',  icon: '🌙', label: 'כהה' },
        { value: 'auto',  icon: '🌗', label: 'אוטומטי (לפי המערכת)' }
      ],
      function (v) { return window.Theme && Theme.mode() === v; },
      function (v) { if (window.Theme) { Theme.set(v); App.toast(v === 'dark' ? '🌙 מצב כהה' : v === 'auto' ? '🌗 לפי המערכת' : '☀️ מצב בהיר'); } }
    );
    return card('🎨 ערכת נושא', 'דף הכתיבה במחברת נשאר בהיר תמיד — כמו נייר', row);
  }

  function fontCard() {
    var row = optionRow(
      [
        { value: 's', icon: 'א', label: 'קטן' },
        { value: 'm', icon: 'א', label: 'רגיל' },
        { value: 'l', icon: 'א', label: 'גדול' }
      ],
      function (v) { return window.Theme && Theme.fontSize() === v; },
      function (v) { if (window.Theme) Theme.setFontSize(v); }
    );
    row.querySelectorAll('.settings-opt-icon').forEach(function (ic, i) {
      ic.style.fontSize = ['13px', '16px', '20px'][i];
    });
    return card('🔠 גודל טקסט', 'משנה את הגודל בכל האתר', row);
  }

  // ── רינדור ────────────────────────────────────────────────────────────────
  function renderView(root) {
    var wrap = el('div', { class: 'settings-grid' }, [nameCard(), themeCard(), fontCard()]);
    // כרטיסים של אחריויות אחרות (גיבוי אוטומטי וכד׳) — כישלון של אחד לא מפיל את המסך
    (window.SETTINGS_CARDS || []).forEach(function (fn) {
      try {
        var c = fn();
        if (c) wrap.appendChild(c);
      } catch (e) { console.warn('settings card failed:', e); }
    });
    root.appendChild(wrap);
  }

  if (window.App && App.register) App.register('settings', renderView);
})();
