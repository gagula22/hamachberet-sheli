(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // סרגל הניווט — אחריות תצוגה בלבד. מרנדר לפי NavMode.get():
  //   'flat'  — כל פריט בנפרד (המקור).
  //   'group' — 7 כלי "המרכז היומי" מקופלים תחת פריט-אב נפתח.
  //   'hub'   — פריט אחד "המרכז היומי" → #/hub (העמוד עם הלשוניות).
  // ה-SECTIONS וה-views לא משתנים; הקיבוץ נגזר משדה group:'daily'.
  // ─────────────────────────────────────────────────────────────────────────

  var OPEN_KEY = 'mahberet.dailyOpen';
  function isOpen() { try { return localStorage.getItem(OPEN_KEY) !== '0'; } catch (e) { return true; } }
  function setOpen(v) { try { localStorage.setItem(OPEN_KEY, v ? '1' : '0'); } catch (e) {} }

  function navMode() { return window.NavMode ? NavMode.get() : 'flat'; }

  function item(s, extraClass) {
    return App.el('button', {
      class: 'nav-item' + (extraClass ? ' ' + extraClass : ''),
      'data-id': s.id,
      onClick: function () { location.hash = '#/' + s.id; }
    }, [
      App.el('span', { class: 'dot', style: { background: 'var(--' + s.color + ')' } }),
      App.el('span', { style: { fontSize: '16px' } }, s.icon),
      App.el('span', {}, s.title)
    ]);
  }

  const Sidebar = {
    render: function (sections) {
      var nav = document.getElementById('nav');
      nav.innerHTML = '';
      var mode = navMode();
      var group = App.dailyGroup;
      var emittedGroup = false;

      sections.forEach(function (s) {
        if (s.navHidden) return;                 // hub: לא פריט רגיל
        var inDaily = s.group === 'daily';

        if (mode === 'flat' || !inDaily) {
          nav.appendChild(item(s));
          return;
        }

        // s שייך ל"מרכז היומי" — מטפלים בקבוצה כולה במופע הראשון בלבד
        if (emittedGroup) return;
        emittedGroup = true;
        var children = sections.filter(function (x) { return x.group === 'daily'; });

        if (mode === 'hub') {
          // פריט-אב יחיד שמוביל לעמוד-המרכז
          nav.appendChild(App.el('button', {
            class: 'nav-item nav-group-head',
            'data-id': 'hub',
            onClick: function () { location.hash = '#/hub'; }
          }, [
            App.el('span', { class: 'dot', style: { background: 'var(--' + group.color + ')' } }),
            App.el('span', { style: { fontSize: '16px' } }, group.icon),
            App.el('span', {}, group.title)
          ]));
          return;
        }

        // mode === 'group' — כותרת נפתחת + ילדים מוזחים.
        // הילדים הם 4 הצרורות/כלים הלוגיים (מ-NavMode), לא 7 ה-views הגולמיים.
        var logical = (window.NavMode && NavMode.dailyChildren) ? NavMode.dailyChildren() : children;
        var open = isOpen();
        var childWrap = App.el('div', { class: 'nav-children' + (open ? '' : ' collapsed') },
          logical.map(function (c) {
            return App.el('button', {
              class: 'nav-item nav-child',
              'data-id': c.id,
              onClick: function () { location.hash = c.route; }
            }, [
              App.el('span', { class: 'dot', style: { background: 'var(--' + c.color + ')' } }),
              App.el('span', { style: { fontSize: '16px' } }, c.icon),
              App.el('span', {}, c.title)
            ]);
          }));

        var caret = App.el('span', { class: 'nav-caret' + (open ? ' open' : '') }, '▾');
        var head = App.el('button', {
          class: 'nav-item nav-group-head' + (open ? ' open' : ''),
          'data-group': 'daily',
          onClick: function () {
            var nowOpen = childWrap.classList.contains('collapsed');
            childWrap.classList.toggle('collapsed', !nowOpen);
            caret.classList.toggle('open', nowOpen);
            head.classList.toggle('open', nowOpen);
            setOpen(nowOpen);
          }
        }, [
          App.el('span', { class: 'dot', style: { background: 'var(--' + group.color + ')' } }),
          App.el('span', { style: { fontSize: '16px' } }, group.icon),
          App.el('span', { style: { flex: '1' } }, group.title),
          caret
        ]);

        nav.appendChild(head);
        nav.appendChild(childWrap);
      });

      if (window.DataBackup) window.DataBackup.renderBar();
    },

    setActive: function (id) {
      // נתיב צרור (#/bundle/<id>) → מדגישים את ילד-הצרור בסרגל. נתיב #/hub → 'hub'.
      var parts = (location.hash || '').replace(/^#\//, '').split('/');
      var activeId = id;
      var inDailyChild = false;
      if (parts[0] === 'bundle' && parts[1]) { activeId = parts[1]; inDailyChild = true; }
      else if (parts[0] === 'hub') { activeId = 'hub'; }
      else if (window.NavMode && NavMode.isDaily(id)) { inDailyChild = true; }

      document.querySelectorAll('.nav-item').forEach(function (n) {
        n.classList.toggle('active', n.dataset.id === activeId);
      });

      if (navMode() === 'group' && inDailyChild) {
        var head = document.querySelector('.nav-group-head[data-group="daily"]');
        if (head) {
          head.classList.add('active');
          var wrap = head.nextElementSibling;
          if (wrap && wrap.classList.contains('nav-children') && wrap.classList.contains('collapsed')) {
            wrap.classList.remove('collapsed');
            setOpen(true);
            var caret = head.querySelector('.nav-caret');
            if (caret) caret.classList.add('open');
          }
        }
      }
    }
  };

  window.Sidebar = Sidebar;
})();
