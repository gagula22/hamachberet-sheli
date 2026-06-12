(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // קישורים-חוזרים (Backlinks) — אחריות עצמאית (בהשראת Obsidian).
  // פאנל "מי מקשר לכאן" בתחתית עורך המחברת: קישורי-ויקי מפורשים (data-tid)
  // וגם אזכורים של שם הנושא בלי קישור. מוזרק ל-DOM של המחברת דרך
  // MutationObserver — אפס עריכה בקבצי המחברת; אם המבנה ישתנה, הפאנל
  // פשוט לא יופיע. קריאה בלבד; ניווט דרך TopicOpen.
  // ─────────────────────────────────────────────────────────────────────────

  function el(t, a, k) { return App.el(t, a || {}, k || []); }

  function activeTopicId() {
    // הנושא הפעיל מזוהה מהשורה המסומנת בעץ (אין צורך ב-API פנימי)
    var row = document.querySelector('.nb-topic.active');
    if (!row || !window.nbTree) return null;
    var name = (row.textContent || '').replace(/[➕🗑️]/g, '').trim();
    var topics = nbTree.getTopics() || [];
    var match = topics.filter(function (t) { return name.indexOf(t.name) > -1 || t.name === name; });
    if (match.length === 1) return match[0].id;
    // שמות כפולים — נזהה לפי הנושא שמוצג בכותרת העורך
    var title = document.querySelector('.nb-title');
    if (title) {
      var byTitle = topics.find(function (t) { return t.name === title.value; });
      if (byTitle) return byTitle.id;
    }
    return match.length ? match[0].id : null;
  }

  function stripHtml(html) {
    var d = document.createElement('div');
    d.innerHTML = html || '';
    return d.textContent || '';
  }

  function findBacklinks(topic) {
    var topics = (window.nbTree ? nbTree.getTopics() : Store.get('topics')) || [];
    var explicit = [], mentions = [];
    var nameOk = topic.name && topic.name.trim().length >= 2;
    topics.forEach(function (t) {
      if (t.id === topic.id || !t.body) return;
      if (t.body.indexOf('data-tid="' + topic.id + '"') > -1) {
        explicit.push(t);
      } else if (nameOk && stripHtml(t.body).indexOf(topic.name) > -1) {
        mentions.push(t);
      }
    });
    return { explicit: explicit, mentions: mentions };
  }

  function buildPanel(topic) {
    var bl = findBacklinks(topic);
    if (!bl.explicit.length && !bl.mentions.length) return null;
    function rows(list, icon) {
      return list.slice(0, 12).map(function (t) {
        return el('button', { class: 'bl-row', onClick: function () { if (window.TopicOpen) TopicOpen.open(t.id, t.name); } },
          [el('span', {}, icon), el('span', { class: 'bl-name' }, t.name || '(נושא)')]);
      });
    }
    var kids = [el('div', { class: 'bl-title' }, '🔗 מי מקשר לכאן (' + (bl.explicit.length + bl.mentions.length) + ')')];
    if (bl.explicit.length) {
      kids.push(el('div', { class: 'bl-group' }, 'קישורים מפורשים'));
      kids = kids.concat(rows(bl.explicit, '⟦⟧'));
    }
    if (bl.mentions.length) {
      kids.push(el('div', { class: 'bl-group' }, 'אזכורים ללא קישור'));
      kids = kids.concat(rows(bl.mentions, '💬'));
    }
    return el('div', { class: 'bl-panel', 'data-backlinks': '1' }, kids);
  }

  var _t = null;
  function refresh() {
    clearTimeout(_t);
    _t = setTimeout(function () {
      var stage = document.querySelector('.nb-stage');
      if (!stage) return;
      var old = document.querySelector('.bl-panel');
      var tid = activeTopicId();
      var topic = tid && window.nbTree ? nbTree.getById(tid) : null;
      var panel = topic ? buildPanel(topic) : null;
      if (old) old.remove();
      if (panel) stage.appendChild(panel);
    }, 300);
  }

  var view = document.getElementById('view');
  if (view && window.MutationObserver) {
    new MutationObserver(function (muts) {
      // מתעלמים ממוטציות שהפאנל שלנו עצמו יצר
      for (var i = 0; i < muts.length; i++) {
        var n = muts[i].target;
        if (n && n.closest && n.closest('.bl-panel')) return;
      }
      if (document.querySelector('.nb-stage')) refresh();
    }).observe(view, { childList: true, subtree: true });
  }
  if (window.Store && Store.subscribe) Store.subscribe(refresh);

  window.Backlinks = { refresh: refresh };
})();
