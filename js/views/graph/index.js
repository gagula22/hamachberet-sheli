(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // מפת קשרים (Graph View) — אחריות עצמאית (בהשראת Obsidian), SVG נקי.
  // צמתים = נושאי המחברת; קשתות = קישורי-ויקי מפורשים (כחול) והיררכיית
  // אב-בן (אפור עדין). פריסת כוחות (force) ידנית: דחייה בין צמתים + קפיץ
  // לאורך קשתות, ~200 איטרציות. לחיצה על צומת פותחת את הנושא; גלגלת =
  // זום; גרירת רקע = הזזה. קריאה בלבד.
  // ─────────────────────────────────────────────────────────────────────────

  function el(t, a, k) { return App.el(t, a || {}, k || []); }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }

  function buildGraph() {
    var topics = (window.nbTree ? nbTree.getTopics() : Store.get('topics')) || [];
    var nodes = topics.map(function (t) {
      return { id: t.id, name: t.name || '(נושא)', links: 0, x: 0, y: 0, vx: 0, vy: 0 };
    });
    var byId = {};
    nodes.forEach(function (n) { byId[n.id] = n; });
    var edges = [];
    topics.forEach(function (t) {
      if (t.parentId && byId[t.parentId]) edges.push({ a: byId[t.id], b: byId[t.parentId], kind: 'tree' });
      var re = /data-tid="([^"]+)"/g, m;
      while ((m = re.exec(t.body || '')) !== null) {
        if (byId[m[1]] && m[1] !== t.id) edges.push({ a: byId[t.id], b: byId[m[1]], kind: 'wiki' });
      }
    });
    edges.forEach(function (e) { e.a.links++; e.b.links++; });
    return { nodes: nodes, edges: edges };
  }

  function layout(g, W, H) {
    var n = g.nodes.length;
    // התחלה במעגל — דטרמיניסטי ויציב
    g.nodes.forEach(function (node, i) {
      var ang = (i / Math.max(1, n)) * Math.PI * 2;
      node.x = W / 2 + Math.cos(ang) * Math.min(W, H) * 0.32;
      node.y = H / 2 + Math.sin(ang) * Math.min(W, H) * 0.32;
    });
    var K = Math.sqrt((W * H) / Math.max(1, n)) * 0.8;
    for (var iter = 0; iter < 220; iter++) {
      var heat = 1 - iter / 220;
      // דחייה
      for (var i = 0; i < n; i++) {
        var a = g.nodes[i];
        a.vx = 0; a.vy = 0;
        for (var j = 0; j < n; j++) {
          if (i === j) continue;
          var b = g.nodes[j];
          var dx = a.x - b.x, dy = a.y - b.y;
          var d2 = dx * dx + dy * dy + 0.01;
          var f = (K * K) / d2;
          a.vx += dx * f * 0.02;
          a.vy += dy * f * 0.02;
        }
      }
      // קפיצים
      g.edges.forEach(function (e) {
        var dx = e.a.x - e.b.x, dy = e.a.y - e.b.y;
        var d = Math.sqrt(dx * dx + dy * dy) + 0.01;
        var f = (d - K) / d * 0.05;
        e.a.vx -= dx * f; e.a.vy -= dy * f;
        e.b.vx += dx * f; e.b.vy += dy * f;
      });
      // צעד + משיכה קלה למרכז
      g.nodes.forEach(function (node) {
        node.vx += (W / 2 - node.x) * 0.002;
        node.vy += (H / 2 - node.y) * 0.002;
        node.x += Math.max(-12, Math.min(12, node.vx * heat * 10));
        node.y += Math.max(-12, Math.min(12, node.vy * heat * 10));
        node.x = Math.max(30, Math.min(W - 30, node.x));
        node.y = Math.max(24, Math.min(H - 24, node.y));
      });
    }
  }

  function renderView(root) {
    var g = buildGraph();
    if (!g.nodes.length) {
      root.appendChild(el('div', { class: 'card' }, [
        el('h2', {}, '🕸️ מפת קשרים'),
        el('div', { class: 'gr-empty' }, 'אין עדיין נושאים במחברת. צור נושאים וקשר ביניהם עם ⟦⟧ קישור פנימי — והמפה תקום לחיים.')
      ]));
      return;
    }
    var W = 1000, H = 640;
    layout(g, W, H);

    var root2 = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'gr-svg' });
    var pan = svg('g', {});
    root2.appendChild(pan);

    g.edges.forEach(function (e) {
      pan.appendChild(svg('line', {
        x1: e.a.x, y1: e.a.y, x2: e.b.x, y2: e.b.y,
        class: e.kind === 'wiki' ? 'gr-edge-wiki' : 'gr-edge-tree'
      }));
    });
    g.nodes.forEach(function (node) {
      var grp = svg('g', { class: 'gr-node', transform: 'translate(' + node.x + ',' + node.y + ')' });
      grp.appendChild(svg('circle', { r: 6 + Math.min(10, node.links * 2) }));
      var label = svg('text', { y: 6 + Math.min(10, node.links * 2) + 13, 'text-anchor': 'middle' });
      label.textContent = node.name.length > 18 ? node.name.slice(0, 18) + '…' : node.name;
      grp.appendChild(label);
      grp.addEventListener('click', function () { if (window.TopicOpen) TopicOpen.open(node.id, node.name); });
      pan.appendChild(grp);
    });

    // זום וגרירה דרך viewBox
    var vb = { x: 0, y: 0, w: W, h: H };
    function applyVb() { root2.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h); }
    root2.addEventListener('wheel', function (e) {
      e.preventDefault();
      var f = e.deltaY > 0 ? 1.15 : 0.87;
      var nw = Math.max(160, Math.min(W * 2.5, vb.w * f));
      var nh = nw * (H / W);
      vb.x += (vb.w - nw) / 2; vb.y += (vb.h - nh) / 2;
      vb.w = nw; vb.h = nh;
      applyVb();
    }, { passive: false });
    var drag = null;
    root2.addEventListener('mousedown', function (e) {
      if (e.target.closest('.gr-node')) return;
      drag = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y };
    });
    window.addEventListener('mousemove', function (e) {
      if (!drag) return;
      var r = root2.getBoundingClientRect();
      vb.x = drag.vx - (e.clientX - drag.x) * (vb.w / r.width);
      vb.y = drag.vy - (e.clientY - drag.y) * (vb.h / r.height);
      applyVb();
    });
    window.addEventListener('mouseup', function () { drag = null; });

    root.appendChild(el('div', { class: 'card gr-card' }, [
      el('h2', {}, '🕸️ מפת קשרים'),
      el('div', { class: 'gr-sub' }, g.nodes.length + ' נושאים · ' + g.edges.filter(function (e) { return e.kind === 'wiki'; }).length + ' קישורי-ויקי · לחיצה על צומת פותחת את הנושא · גלגלת = זום, גרירה = הזזה'),
      root2
    ]));
  }

  if (window.App && App.register) App.register('graph', renderView);
})();
