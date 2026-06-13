(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // המרכז היומי + צרורות — אחריות עצמאית. מארח את ה-views הקיימים בלשוניות
  // מבלי לשנות אותם: קורא לפונקציית הרינדור הרשומה (App._routes[id]) לתוך
  // מיכל. שני view:
  //   'bundle' — עמוד-מיני של צרור (משימות / מעקב יומי / ידע וזיכרון), נתיב
  //              #/bundle/<bundleId>/<memberId?>.
  //   'hub'    — עמוד-מרכז (אפשרות ב): 4 הילדים כלשוניות; צרור פותח שורת
  //              לשוניות-משנה. נתיב #/hub/<childId>/<memberId?>.
  // ─────────────────────────────────────────────────────────────────────────

  function el(t, a, k) { return App.el(t, a || {}, k || []); }

  function hashParts() { return (location.hash || '').replace(/^#\//, '').split('/'); }

  // שורת לשוניות + מיכל; קורא ל-render של הלשונית הפעילה.
  // tabs: [{ id, title, icon, onClick, render(pane) }]
  function renderTabPage(root, tabs, activeId, extraClass) {
    var active = tabs.filter(function (t) { return t.id === activeId; })[0] || tabs[0];
    var row = el('div', { class: 'hub-tabs' + (extraClass ? ' ' + extraClass : '') }, tabs.map(function (t) {
      return el('button', { class: 'hub-tab' + (t.id === active.id ? ' active' : ''), onClick: t.onClick }, [
        el('span', { class: 'hub-tab-icon' }, t.icon),
        el('span', {}, t.title)
      ]);
    }));
    var pane = el('div', { class: 'hub-pane' });
    root.appendChild(row);
    root.appendChild(pane);
    try { active.render(pane); }
    catch (e) { pane.appendChild(el('div', { class: 'empty-state' }, 'שגיאה בטעינת הכלי.')); console.warn('hub render failed:', e); }
  }

  function renderHostView(memberId) {
    return function (pane) {
      var fn = App._routes[memberId];
      if (fn) fn(pane, undefined);
      else pane.appendChild(el('div', { class: 'empty-state' }, 'הכלי לא נטען.'));
    };
  }

  function setTitle(txt) {
    var c = document.getElementById('crumbs'); if (c) c.textContent = txt;
    var p = document.getElementById('pageTitle'); if (p) p.textContent = txt;
  }

  // ── צרור בודד: #/bundle/<id>/<member?> ───────────────────────────────────
  function renderBundle(root) {
    var p = hashParts();                 // ['bundle', bundleId, memberId?]
    var b = window.NavMode ? NavMode.bundleById(p[1]) : null;
    if (!b) { root.appendChild(el('div', { class: 'empty-state' }, 'הצרור לא נמצא.')); return; }
    setTitle(b.icon + ' ' + b.title);
    var tabs = b.members.map(function (m) {
      return {
        id: m.id, title: m.title, icon: m.icon,
        onClick: function () { location.hash = '#/bundle/' + b.id + '/' + m.id; },
        render: renderHostView(m.id)
      };
    });
    renderTabPage(el2(root), tabs, p[2] || b.members[0].id);
  }

  // עוטף ב-hub-wrap כדי לקבל אנימציית כניסה אחידה
  function el2(root) { var w = el('div', { class: 'hub-wrap' }); root.appendChild(w); return w; }

  // ── עמוד-מרכז של קבוצה: #/hub/<groupId>/<childId?>/<member?> ─────────────
  function renderHub(root) {
    var p = hashParts();                 // ['hub', groupId?, childId?, memberId?]
    var groups = window.NavMode ? NavMode.groups() : [];
    var groupId = (window.NavMode && NavMode.groupById(p[1])) ? p[1] : (groups[0] && groups[0].id);
    var group = window.NavMode ? NavMode.groupById(groupId) : null;
    var children = group ? NavMode.groupChildren(groupId) : [];
    if (!children.length) { root.appendChild(el('div', { class: 'empty-state' }, 'אין כלים בקבוצה.')); return; }
    if (group) setTitle(group.icon + ' ' + group.title);
    var activeChildId = children.some(function (c) { return c.id === p[2]; }) ? p[2] : children[0].id;

    var tabs = children.map(function (c) {
      return {
        id: c.id, title: c.title, icon: c.icon,
        onClick: function () { location.hash = '#/hub/' + groupId + '/' + c.id; },
        render: function (pane) {
          if (c.isBundle && window.NavMode) {
            var b = NavMode.bundleById(c.id);
            var memberId = (activeChildId === c.id && p[3]) ? p[3] : b.members[0].id;
            var subTabs = b.members.map(function (m) {
              return {
                id: m.id, title: m.title, icon: m.icon,
                onClick: function () { location.hash = '#/hub/' + groupId + '/' + c.id + '/' + m.id; },
                render: renderHostView(m.id)
              };
            });
            renderTabPage(pane, subTabs, memberId, 'hub-subtabs');
          } else {
            renderHostView(c.id)(pane);
          }
        }
      };
    });
    var wrap = el2(root);
    renderTabPage(wrap, tabs, activeChildId);
  }

  if (window.App && App.register) {
    App.register('bundle', renderBundle);
    App.register('hub', renderHub);
  }
})();
