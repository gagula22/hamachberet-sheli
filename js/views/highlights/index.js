(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // מרכז הדגשות וחיפוש — אחריות עצמאית (בהשראת Readwise).
  // v2 לפי משוב המשתמש: רץ על כל המחברות עם בחירה לפי מחברת ראשית +
  // חיפוש מילת מפתח. שני מצבים:
  //   🖍️ הדגשות — כל מה שסומן במרקר (מסונן לפי מחברת + מילת מפתח)
  //   🔎 כל הטקסט — כל פסקה בכל עמודי המחברת שמכילה את מילת המפתח,
  //      מקובצת לפי עמוד, עם הדגשת המילה וקפיצה למקור.
  // קריאה בלבד מה-Store; ניווט דרך TopicOpen / openNoteId.
  // ─────────────────────────────────────────────────────────────────────────

  function el(t, a, k) { return App.el(t, a || {}, k || []); }

  var _mode = 'marks';   // marks | text
  var _root = 'all';     // 'all' | topicId של מחברת ראשית | 'notes'
  var _query = '';

  // ── עזרי נתונים ───────────────────────────────────────────────────────────
  function topics() { return Store.get('topics') || []; }
  function rootMap() {
    var byId = {};
    topics().forEach(function (t) { byId[t.id] = t; });
    var cache = {};
    function rootOf(t) {
      if (cache[t.id]) return cache[t.id];
      var cur = t, guard = 0;
      while (cur.parentId && byId[cur.parentId] && guard++ < 50) cur = byId[cur.parentId];
      cache[t.id] = cur.id;
      return cur.id;
    }
    return { byId: byId, rootOf: rootOf };
  }
  function stripHtml(html) {
    var d = document.createElement('div');
    d.innerHTML = html || '';
    return d.textContent || '';
  }

  // ── חילוץ הדגשות ─────────────────────────────────────────────────────────
  function extractHighlights(html) {
    if (!html || html.indexOf('background') === -1) return [];
    var doc;
    try { doc = new DOMParser().parseFromString(html, 'text/html'); } catch (e) { return []; }
    var out = [];
    doc.querySelectorAll('[style*="background"]').forEach(function (n) {
      var bg = (n.style && (n.style.backgroundColor || n.style.background)) || '';
      if (!bg || bg === 'transparent' || /^(#fff(fff)?|white|rgba?\(255,\s*255,\s*255)/i.test(bg.replace(/\s/g, ''))) return;
      if (n.querySelector('[style*="background"]')) return;
      var text = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.length < 2) return;
      out.push({ text: text, color: bg });
    });
    return out;
  }

  // ── חילוץ פסקאות עם מילת מפתח ─────────────────────────────────────────────
  function extractMatches(html, q) {
    if (!html) return [];
    var doc;
    try { doc = new DOMParser().parseFromString(html, 'text/html'); } catch (e) { return []; }
    var out = [];
    var blocks = doc.body.querySelectorAll('p, li, h1, h2, h3, blockquote, td, div');
    var seen = {};
    blocks.forEach(function (b) {
      if (b.querySelector('p, li, h1, h2, h3, blockquote')) return; // ניקח עלים בלבד
      var text = (b.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text || text.indexOf(q) === -1) return;
      if (seen[text]) return;
      seen[text] = 1;
      out.push(text.length > 220 ? clipAround(text, q, 220) : text);
    });
    // גוף בלי תגיות-בלוק (טקסט ישיר)
    if (!out.length) {
      var whole = stripHtml(html).replace(/\s+/g, ' ').trim();
      if (whole.indexOf(q) > -1) out.push(clipAround(whole, q, 220));
    }
    return out;
  }
  function clipAround(text, q, max) {
    var i = text.indexOf(q);
    var start = Math.max(0, i - Math.floor((max - q.length) / 2));
    var s = text.slice(start, start + max);
    return (start > 0 ? '…' : '') + s + (start + max < text.length ? '…' : '');
  }
  function markNode(text, q) {
    var node = el('span', {});
    if (!q) { node.textContent = text; return node; }
    var idx = 0, pos;
    while ((pos = text.indexOf(q, idx)) > -1) {
      node.appendChild(document.createTextNode(text.slice(idx, pos)));
      node.appendChild(el('mark', { class: 'hl-mark' }, q));
      idx = pos + q.length;
    }
    node.appendChild(document.createTextNode(text.slice(idx)));
    return node;
  }

  // ── איסוף לפי מצב/סינון ───────────────────────────────────────────────────
  function sources() {
    var rm = rootMap();
    var list = topics().map(function (t) {
      return {
        kind: 'topic', icon: '📓', id: t.id, name: t.name || '(נושא)',
        rootId: rm.rootOf(t),
        rootName: (rm.byId[rm.rootOf(t)] || {}).name || '',
        body: t.body || '',
        open: function () { if (window.TopicOpen) TopicOpen.open(t.id, t.name); }
      };
    });
    (Store.get('notes') || []).forEach(function (n) {
      list.push({
        kind: 'note', icon: '📝', id: n.id, name: n.title || '(הערה)',
        rootId: 'notes', rootName: 'הערות', body: n.body || '',
        open: function () { try { sessionStorage.setItem('openNoteId', n.id); } catch (e) {} location.hash = '#/notes'; }
      });
    });
    return list;
  }

  // ── רינדור ────────────────────────────────────────────────────────────────
  function renderView(root) {
    function rerender() { root.innerHTML = ''; build(); }
    function build() {
      var srcs = sources();
      var q = _query.trim();

      // צ'יפי מחברות ראשיות
      var roots = topics().filter(function (t) { return !t.parentId; });
      var chips = el('div', { class: 'hl-roots' });
      function chip(value, label) {
        var b = el('button', {
          class: 'tab' + (_root === value ? ' active' : ''),
          onClick: function () {
            _root = value;
            chips.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('active'); });
            b.classList.add('active');
            drawResults();
          }
        }, label);
        chips.appendChild(b);
      }
      chip('all', 'כל המחברות');
      roots.forEach(function (t) { chip(t.id, '📓 ' + (t.name || '(מחברת)')); });
      chip('notes', '📝 הערות');

      // מצבים + חיפוש
      var modeTabs = el('div', { class: 'tabs hl-modes' }, [
        ['marks', '🖍️ הדגשות'], ['text', '🔎 כל הטקסט']
      ].map(function (m) {
        return el('button', {
          class: 'tab' + (_mode === m[0] ? ' active' : ''),
          onClick: function (e) {
            _mode = m[0];
            modeTabs.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('active'); });
            e.currentTarget.classList.add('active');
            drawResults();
          }
        }, m[1]);
      }));
      var search = el('input', {
        class: 'input hl-search', type: 'text', value: _query,
        placeholder: 'מילת מפתח… (במצב "כל הטקסט" — חובה)',
        onInput: function (e) { _query = e.target.value; q = _query.trim(); drawResults(); }
      });

      var resWrap = el('div', { class: 'hl-results' });

      function drawResults() {
        q = _query.trim();
        resWrap.innerHTML = '';
        var filtered = srcs.filter(function (s) { return _root === 'all' ? true : s.rootId === _root; });
        var shown = 0;

        if (_mode === 'marks') {
          filtered.forEach(function (s) {
            var hs = extractHighlights(s.body).filter(function (h) { return !q || h.text.indexOf(q) > -1; });
            if (!hs.length) return;
            shown += hs.length;
            var card = el('div', { class: 'card hl-group' }, [
              el('button', { class: 'hl-source', onClick: s.open }, [
                el('span', {}, s.icon + ' ' + s.name + (s.rootName && s.rootName !== s.name ? ' · ' + s.rootName : '')),
                el('span', { class: 'hl-jump' }, 'פתח ↗')
              ])
            ]);
            hs.forEach(function (h) {
              var blockq = el('blockquote', { class: 'hl-quote' }, [markNode(h.text, q)]);
              blockq.style.borderInlineStartColor = h.color;
              card.appendChild(blockq);
            });
            resWrap.appendChild(card);
          });
          if (!shown) {
            resWrap.appendChild(el('div', { class: 'card hl-none' },
              q ? 'אין הדגשות שמכילות "' + q + '" בבחירה הזו.'
                : 'אין קטעים מודגשים בבחירה הזו. סמן טקסט במרקר 🖍 במחברת — והוא יופיע כאן.'));
          }
        } else {
          if (!q) {
            resWrap.appendChild(el('div', { class: 'card hl-none' }, 'הקלד מילת מפתח כדי לחפש בכל הטקסט של המחברות.'));
            return;
          }
          filtered.forEach(function (s) {
            var ms = extractMatches(s.body, q);
            if (!ms.length) return;
            shown += ms.length;
            var card = el('div', { class: 'card hl-group' }, [
              el('button', { class: 'hl-source', onClick: s.open }, [
                el('span', {}, s.icon + ' ' + s.name + (s.rootName && s.rootName !== s.name ? ' · ' + s.rootName : '')),
                el('span', { class: 'hl-jump' }, 'פתח ↗')
              ])
            ]);
            ms.slice(0, 10).forEach(function (m) {
              card.appendChild(el('div', { class: 'hl-textmatch' }, [markNode(m, q)]));
            });
            resWrap.appendChild(card);
          });
          if (!shown) resWrap.appendChild(el('div', { class: 'card hl-none' }, 'לא נמצא "' + q + '" בבחירה הזו.'));
        }
      }

      root.appendChild(el('div', { class: 'card hl-head-card' }, [
        el('h2', {}, '🖍️ מרכז הדגשות וחיפוש'),
        el('div', { class: 'hl-sub' }, 'בחר מחברת ראשית (או כולן), הקלד מילת מפתח — וקבל את כל ההדגשות או את כל המופעים בטקסט, עם קפיצה למקור.'),
        el('div', { class: 'tabs hl-chip-row' }, [chips]),
        modeTabs,
        search
      ]));
      root.appendChild(resWrap);
      drawResults();
    }
    build();
  }

  if (window.App && App.register) App.register('highlights', renderView);
})();
