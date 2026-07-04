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
    return (d.textContent || '').replace(/\s+/g, ' ');
  }

  // "תו-מילה" לצורך גבולות: אות עברית/לטינית או ספרה. שים לב: \b של JS מבוסס
  // על \w שאינו כולל עברית — לכן בודקים גבולות ידנית מול הטווח הזה.
  var WORD   = /[A-Za-z0-9א-ת]/;
  // קידומות עבריות של אות אחת שלגיטימי שיידבקו לשם (בית/ה/ו/כ/ל/מ/ש).
  var PREFIX = /[בהוכלמש]/;

  // מחזיר את אינדקס האזכור הראשון של name בתוך text כ"מילה שלמה":
  // מימין חייב להיגמר בגבול (סוף מילה), ומשמאל מותר גבול או קידומת עברית בודדת.
  // כך "בביטקוין" עדיין נחשב אזכור של "ביטקוין", אבל "xשםy" באמצע מילה — לא.
  function mentionIndex(text, name) {
    var from = 0, idx;
    while ((idx = text.indexOf(name, from)) > -1) {
      var before = text.charAt(idx - 1);
      var after  = text.charAt(idx + name.length);
      var rightOk = !WORD.test(after); // השם גומר את המילה
      var leftOk  = !WORD.test(before) ||
                    (PREFIX.test(before) && !WORD.test(text.charAt(idx - 2)));
      if (rightOk && leftOk) return idx;
      from = idx + 1;
    }
    return -1;
  }

  function findBacklinks(topic) {
    var topics = (window.nbTree ? nbTree.getTopics() : Store.get('topics')) || [];
    var explicit = [], mentions = [];
    var nameOk = topic.name && topic.name.trim().length >= 2;
    var name = nameOk ? topic.name.trim() : '';
    topics.forEach(function (t) {
      if (t.id === topic.id || !t.body) return;
      if (t.body.indexOf('data-tid="' + topic.id + '"') > -1) {
        explicit.push(t);
        return;
      }
      if (!nameOk) return;
      var text = stripHtml(t.body);
      var idx = mentionIndex(text, name);
      if (idx > -1) mentions.push({ t: t, text: text, idx: idx, len: name.length });
    });
    return { explicit: explicit, mentions: mentions };
  }

  // קטע-הקשר סביב האזכור, עם המילה מודגשת. בנוי מ-textNodes בלבד (בלי innerHTML)
  // כדי שתוכן-המשתמש לעולם לא יורץ כ-HTML.
  function snippetEl(m) {
    var R = 46;
    var s = Math.max(0, m.idx - R);
    var e = Math.min(m.text.length, m.idx + m.len + R);
    var pre  = (s > 0 ? '…' : '') + m.text.slice(s, m.idx);
    var mid  = m.text.slice(m.idx, m.idx + m.len);
    var post = m.text.slice(m.idx + m.len, e) + (e < m.text.length ? '…' : '');
    return el('div', { class: 'bl-snippet' }, [
      document.createTextNode(pre),
      el('mark', { class: 'bl-hl' }, mid),
      document.createTextNode(post)
    ]);
  }

  function buildPanel(topic) {
    var bl = findBacklinks(topic);
    if (!bl.explicit.length && !bl.mentions.length) return null;
    // קישורים מפורשים — שורה פשוטה (הקישור מכוון, אין צורך בהקשר).
    function explicitRows(list) {
      return list.slice(0, 12).map(function (t) {
        return el('button', { class: 'bl-row', onClick: function () { if (window.TopicOpen) TopicOpen.open(t.id, t.name); } },
          [el('span', {}, '⟦⟧'), el('span', { class: 'bl-name' }, t.name || '(נושא)')]);
      });
    }
    // אזכורים — שם + קטע-הקשר עם המילה מודגשת, כדי לראות באיזה הקשר מזכירים.
    function mentionRows(list) {
      return list.slice(0, 12).map(function (m) {
        var t = m.t;
        return el('button', { class: 'bl-row bl-row-mention', onClick: function () { if (window.TopicOpen) TopicOpen.open(t.id, t.name); } }, [
          el('div', { class: 'bl-row-head' }, [el('span', {}, '💬'), el('span', { class: 'bl-name' }, t.name || '(נושא)')]),
          snippetEl(m)
        ]);
      });
    }
    var kids = [el('div', { class: 'bl-title' }, '🔗 מי מקשר לכאן (' + (bl.explicit.length + bl.mentions.length) + ')')];
    if (bl.explicit.length) {
      kids.push(el('div', { class: 'bl-group' }, 'קישורים מפורשים'));
      kids = kids.concat(explicitRows(bl.explicit));
    }
    if (bl.mentions.length) {
      kids.push(el('div', { class: 'bl-group' }, 'אזכורים ללא קישור'));
      kids = kids.concat(mentionRows(bl.mentions));
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
