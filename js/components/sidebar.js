(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // סרגל הניווט — אחריות תצוגה בלבד. מרנדר לפי NavMode.get() ולפי הקבוצות
  // שמוגדרות ב-NavMode (כיום: "המרכז היומי" ו"ידע ולכידה"):
  //   'flat'  — כל פריט בנפרד (המקור).
  //   'group' — כל קבוצה מקופלת תחת פריט-אב נפתח (ילדים = צרורות/כלים).
  //   'hub'   — כל קבוצה = פריט אחד → עמוד-מרכז (#/hub/<groupId>).
  // הקיבוץ נגזר משדה group של ה-SECTIONS; ה-views לא משתנים.
  // ─────────────────────────────────────────────────────────────────────────

  function openKey(groupId) { return 'mahberet.open.' + groupId; }
  function isOpen(groupId) { try { return localStorage.getItem(openKey(groupId)) !== '0'; } catch (e) { return true; } }
  function setOpen(groupId, v) { try { localStorage.setItem(openKey(groupId), v ? '1' : '0'); } catch (e) {} }

  function navMode() { return window.NavMode ? NavMode.get() : 'flat'; }
  function groups() { return window.NavMode ? NavMode.groups() : []; }

  function navBtn(opts, color, icon, title, extra) {
    return App.el('button', opts, [
      App.el('span', { class: 'dot', style: { background: 'var(--' + color + ')' } }),
      App.el('span', { style: { fontSize: '16px' } }, icon),
      App.el('span', extra && extra.flex ? { style: { flex: '1' } } : {}, title)
    ].concat(extra && extra.caret ? [extra.caret] : []));
  }

  function plainItem(s, extraClass) {
    return navBtn({
      class: 'nav-item' + (extraClass ? ' ' + extraClass : ''),
      'data-id': s.id,
      onClick: function () { location.hash = '#/' + s.id; }
    }, s.color, s.icon, s.title);
  }

  // קבוצה במצב 'group' — כותרת נפתחת + ילדים מוזחים
  function renderGroupCollapsible(nav, group) {
    var children = NavMode.groupChildren(group.id);
    var open = isOpen(group.id);
    var childWrap = App.el('div', { class: 'nav-children' + (open ? '' : ' collapsed') },
      children.map(function (c) {
        return navBtn({ class: 'nav-item nav-child', 'data-id': c.id, onClick: function () { location.hash = c.route; } },
          c.color, c.icon, c.title);
      }));
    var caret = App.el('span', { class: 'nav-caret' + (open ? ' open' : '') }, '▾');
    var head = navBtn({
      class: 'nav-item nav-group-head' + (open ? ' open' : ''),
      'data-group': group.id,
      onClick: function () {
        var nowOpen = childWrap.classList.contains('collapsed');
        childWrap.classList.toggle('collapsed', !nowOpen);
        caret.classList.toggle('open', nowOpen);
        head.classList.toggle('open', nowOpen);
        setOpen(group.id, nowOpen);
      }
    }, group.color, group.icon, group.title, { flex: true, caret: caret });
    nav.appendChild(head);
    nav.appendChild(childWrap);
  }

  // קבוצה במצב 'hub' — פריט-אב יחיד → עמוד-מרכז
  function renderGroupHubEntry(nav, group) {
    nav.appendChild(navBtn({
      class: 'nav-item nav-group-head',
      'data-group-hub': group.id,
      onClick: function () { location.hash = '#/hub/' + group.id; }
    }, group.color, group.icon, group.title));
  }

  const Sidebar = {
    render: function (sections) {
      var nav = document.getElementById('nav');
      nav.innerHTML = '';
      var mode = navMode();
      var emitted = {};   // groupId → already rendered

      sections.forEach(function (s) {
        if (s.navHidden) return;
        var gid = s.group;

        if (mode === 'flat' || !gid || !NavMode.groupById(gid)) {
          nav.appendChild(plainItem(s));
          return;
        }
        // פריט שייך לקבוצה — הקבוצה כולה נרנדרת פעם אחת, במיקום הפריט הראשון שלה
        if (emitted[gid]) return;
        emitted[gid] = true;
        var group = NavMode.groupById(gid);
        if (mode === 'hub') renderGroupHubEntry(nav, group);
        else renderGroupCollapsible(nav, group);
      });

      if (window.DataBackup) window.DataBackup.renderBar();
    },

    setActive: function (id) {
      var parts = (location.hash || '').replace(/^#\//, '').split('/');
      var activeId = id;
      var activeGroup = null;   // קבוצה להדגשה (במצב group/hub)

      if (parts[0] === 'bundle' && parts[1]) {
        activeId = parts[1];
        // לאיזו קבוצה שייך הצרור?
        groups().forEach(function (g) { if (g.children.some(function (c) { return c.bundle === parts[1]; })) activeGroup = g.id; });
      } else if (parts[0] === 'hub' && parts[1]) {
        activeId = null;
        activeGroup = parts[1];
      } else if (window.NavMode) {
        activeGroup = NavMode.groupOf(id);
      }

      document.querySelectorAll('.nav-item').forEach(function (n) {
        n.classList.toggle('active', !!activeId && n.dataset.id === activeId);
      });

      if (!activeGroup) return;
      var mode = navMode();
      if (mode === 'hub') {
        var hubHead = document.querySelector('.nav-group-head[data-group-hub="' + activeGroup + '"]');
        if (hubHead) hubHead.classList.add('active');
      } else if (mode === 'group') {
        var head = document.querySelector('.nav-group-head[data-group="' + activeGroup + '"]');
        if (head) {
          head.classList.add('active');
          var wrap = head.nextElementSibling;
          if (wrap && wrap.classList.contains('nav-children') && wrap.classList.contains('collapsed')) {
            wrap.classList.remove('collapsed');
            setOpen(activeGroup, true);
            var caret = head.querySelector('.nav-caret');
            if (caret) caret.classList.add('open');
          }
        }
      }
    }
  };

  window.Sidebar = Sidebar;
})();
