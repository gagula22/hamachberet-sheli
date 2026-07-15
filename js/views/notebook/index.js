(function () {
  const TOPIC_ICONS = ['📓','📔','📕','📗','📘','📙','📒','📑','🗂️','📂'];
  const SIDEBAR_KEY = 'nb.sidebarW';
  const SIDEBAR_MIN = 180;
  const SIDEBAR_MAX = 600;
  let activeId = null;
  window.nbActive = { editor: null };  // shared active-editor handle (editor.js writes; flushActiveEditor reads)
  const expanded = new Set();

  // Safety net: if the user closes the tab mid-debounce (within 500ms of
  // last keystroke), the editor's debounced save never fires. Flush the
  // current editor's content immediately so FirebaseSync's own pagehide
  // listener finds it in `pending` and pushes it.
  function flushActiveEditor() {
    try {
      if (window.nbActive.editor && window.nbActive.editor.saveImmediate) window.nbActive.editor.saveImmediate();
      if (window.Store && Store.saveNow) Store.saveNow();
      if (window.FirebaseSync && FirebaseSync.flush) FirebaseSync.flush();
    } catch {}
  }
  window.addEventListener('pagehide', flushActiveEditor);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushActiveEditor();
  });

  // ── Scroll-position memory ────────────────────────────────────────────────
  // ⚠️ There are TWO possible scrollers (ARCHITECTURE §15):
  //   • Desktop: the note scrolls INSIDE `.nb-editor-col` (overflow-y:auto,
  //     capped at max-height:100% — since the vh-unzoom fix the cap is real,
  //     so the window itself never scrolls).
  //   • Mobile (≤600px): `.nb-editor-col` is overflow:visible and the WINDOW
  //     scrolls.
  // App.render() rebuilds #view on every cloud echo / focusout-deferred render /
  // data-ready pass and when returning to the notebook — a rebuilt column starts
  // at scrollTop 0 → the note "jumped to the top" (the bug returned when the
  // scroller moved from the window into the column). Remember BOTH positions for
  // the active topic, re-apply them after each render, and persist them
  // (sessionStorage) so a refresh/tab-restore reopens the same note in place.
  const NB_SCROLL_KEY = 'nb.scroll';
  let lastScrollY = 0;         // window scroll (mobile scroller)
  let lastColY = 0;            // .nb-editor-col scrollTop (desktop scroller)
  let restorePending = null;   // { id, y, colY } — applied on the first render after a page load
  let _restoreGuard = 0;       // while > now: a restore is settling — don't let the
                               // collapse-to-0 scroll events overwrite the saved spot
  try {
    const raw = sessionStorage.getItem(NB_SCROLL_KEY);
    // Seed lastScrollY/lastColY too: a refresh renders twice (immediate + after
    // Store.ready), so the second (data-ready) render must target the same
    // restored position and not fall back to 0 before the listeners caught up.
    if (raw) { const o = JSON.parse(raw); if (o && o.id) { restorePending = o; lastScrollY = o.y || 0; lastColY = o.colY || 0; } }
  } catch {}
  function _persistScroll() {
    try { sessionStorage.setItem(NB_SCROLL_KEY, JSON.stringify({ id: activeId, y: lastScrollY, colY: lastColY })); } catch {}
  }
  let _scrollRaf = 0;
  window.addEventListener('scroll', () => {
    // only track while the notebook is the visible view
    if (!location.hash || location.hash.indexOf('#/notebook') !== 0) return;
    if (_scrollRaf) return;
    _scrollRaf = requestAnimationFrame(() => {
      _scrollRaf = 0;
      if (!activeId || performance.now() < _restoreGuard) return;
      lastScrollY = window.scrollY || (document.scrollingElement || {}).scrollTop || 0;
      _persistScroll();
    });
  }, { passive: true });
  // Column scroller: scroll events don't bubble, but they DO capture — one
  // document-level capture listener survives every re-render (no re-wiring).
  let _colRaf = 0;
  document.addEventListener('scroll', (e) => {
    if (!location.hash || location.hash.indexOf('#/notebook') !== 0) return;
    const el = e.target;
    if (!el || el.nodeType !== 1 || !el.classList || !el.classList.contains('nb-editor-col')) return;
    if (_colRaf) return;
    _colRaf = requestAnimationFrame(() => {
      _colRaf = 0;
      if (!activeId || performance.now() < _restoreGuard) return;
      lastColY = el.scrollTop;
      _persistScroll();
    });
  }, { capture: true, passive: true });
  // Re-apply a remembered position after a render. Image-heavy notes grow in
  // height as images decode, so a single scrollTo gets clamped short — retry
  // briefly until the target sticks, aborting the moment the user scrolls.
  function applyScrollAfterRender(winY, colY) {
    _restoreGuard = performance.now() + 1500;
    let appliedCol = -1, tries = 0;
    const attempt = () => {
      const col = document.querySelector('.nb-editor-col');
      if (col) {
        if (appliedCol >= 0 && Math.abs(col.scrollTop - appliedCol) > 2) { _restoreGuard = 0; return; } // user took over
        col.scrollTop = colY;
        appliedCol = col.scrollTop;
      }
      window.scrollTo(0, winY);
      if (col && appliedCol < colY - 2 && ++tries < 10) setTimeout(attempt, 140);
      else { _restoreGuard = 0; lastColY = colY; lastScrollY = winY; }
    };
    requestAnimationFrame(attempt);
  }

  // Restore saved sidebar width once on first load
  try {
    const saved = localStorage.getItem(SIDEBAR_KEY);
    if (saved) document.documentElement.style.setProperty('--nb-sidebar-w', saved);
  } catch {}

  function getTopics() { return Store.get('topics') || []; }
  function getById(id) { return getTopics().find(t => t.id === id); }
  function getChildren(parentId) {
    return getTopics()
      .filter(t => (t.parentId || null) === (parentId || null))
      .sort((a, b) => {
        // After drag & drop, order is a small integer (0,1,2…); before that it's a timestamp.
        // Both are numeric — smaller = higher up in the list.
        const aO = a.order !== undefined ? a.order : (a.createdAt || 0);
        const bO = b.order !== undefined ? b.order : (b.createdAt || 0);
        return aO - bO;
      });
  }
  function hasChildren(id) { return getChildren(id).length > 0; }
  function getDescendantIds(id) {
    const all = getTopics();
    const out = [];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop();
      out.push(cur);
      all.filter(t => (t.parentId || null) === cur).forEach(c => stack.push(c.id));
    }
    return out;
  }

  function getRootAncestor(id) {
    let cur = getById(id);
    while (cur && cur.parentId) {
      const parent = getById(cur.parentId);
      if (!parent) break;
      cur = parent;
    }
    return cur;
  }

  function preorderSubtree(rootId) {
    const out = [];
    (function walk(id) {
      const t = getById(id);
      if (!t) return;
      out.push(t);
      getChildren(id).forEach(c => walk(c.id));
    })(rootId);
    return out;
  }

  function getPageContext(currentId) {
    const root = getRootAncestor(currentId);
    if (!root) return { offset: 0, total: 0 };
    const ordered = preorderSubtree(root.id);
    let offset = 0;
    for (const t of ordered) {
      if (t.id === currentId) break;
      offset += Math.max(1, t.pageCount || 1);
    }
    const total = ordered.reduce((s, t) => s + Math.max(1, t.pageCount || 1), 0);
    return { offset, total, rootName: root.name };
  }

  function createTopic(parentId) {
    const parent = parentId ? getById(parentId) : null;
    const promptMsg = parent ? `שם תת-הנושא תחת "${parent.name}":` : 'שם הנושא החדש:';
    const name = prompt(promptMsg);
    if (!name || !name.trim()) return null;
    const list = getTopics();
    const t = {
      id: Store.uid(),
      name: name.trim(),
      icon: TOPIC_ICONS[list.length % TOPIC_ICONS.length],
      body: '',
      parentId: parentId || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      order: Date.now()
    };
    list.push(t);
    Store.set('topics', list);
    if (parentId) expanded.add(parentId);
    return t;
  }

  function deleteTopic(id) {
    const t = getById(id);
    if (!t) return;
    const ids = getDescendantIds(id);
    const childCount = ids.length - 1;
    const msg = childCount
      ? `למחוק את "${t.name}" ועוד ${childCount} תתי-נושאים?`
      : `למחוק את "${t.name}"?`;
    if (!confirm(msg)) return;
    const remaining = getTopics().filter(x => !ids.includes(x.id));
    Store.set('topics', remaining);
    if (ids.includes(activeId)) {
      activeId = remaining[0] ? remaining[0].id : null;
    }
  }

  let lastRenderedId = null;
  let draggedId = null;
  let mobilePanel = 'topics'; // 'topics' | 'editor'
  let activeTagFilter = null;  // tag string or null

  function isMobile() { return window.innerWidth <= 768; }

  function render(root) {
    const topics = getTopics();
    // Refresh restore: reopen the exact topic the user last viewed (if it still
    // exists) instead of defaulting to the first one. Kept pending until the
    // topics have actually loaded (localStorage may be empty on first paint).
    if (restorePending) {
      if (getById(restorePending.id)) activeId = restorePending.id;
      else if (topics.length) restorePending = null;   // that topic is gone → give up
    }
    if (!activeId && topics.length) {
      const firstRoot = topics.find(t => !t.parentId);
      activeId = (firstRoot || topics[0]).id;
    }
    const active = getById(activeId);

    // Decide where BOTH scrollers should sit AFTER this render is built:
    let scrollTarget, colTarget;
    if (restorePending && activeId === restorePending.id) {
      scrollTarget = restorePending.y || 0;    // first paint after a page refresh → same place
      colTarget    = restorePending.colY || 0;
      restorePending = null;
      lastRenderedId = activeId;               // not a topic switch
    } else if (active && activeId !== lastRenderedId) {
      lastRenderedId = activeId;
      scrollTarget = 0;                        // switched to a different note → start at top
      colTarget    = 0;
    } else {
      scrollTarget = lastScrollY;              // same note re-rendered (cloud echo / return) → keep the place
      colTarget    = lastColY;
    }
    if (active) applyScrollAfterRender(scrollTarget, colTarget);

    const addRootBtn = App.el('button', {
      class: 'nb-sidebar-add-btn',
      title: 'נושא חדש',
      onClick: () => {
        const t = createTopic(null);
        if (t) { activeId = t.id; if (isMobile()) mobilePanel = 'editor'; rerender(); }
      }
    }, '+');

    // ── Topics list (supports tag filter) ───────────────────────────────
    let topicsContent;
    if (activeTagFilter) {
      const filtered = topics.filter(t => Array.isArray(t.tags) && t.tags.includes(activeTagFilter));
      topicsContent = filtered.length
        ? filtered.map(t => renderRow(t, 0))
        : [App.el('div', { class: 'empty-state', style: { padding: '24px 8px' } }, 'לא נמצאו נושאים עם תגית זו')];
    } else {
      topicsContent = topics.length
        ? renderTree(null, 0)
        : [App.el('div', { class: 'empty-state', style: { padding: '24px 8px' } }, 'עדיין אין נושאים')];
    }
    const topicsEl = App.el('div', { class: 'nb-topics' }, topicsContent);

    // ── Tag cloud ────────────────────────────────────────────────────────
    const tagCounts = {};
    topics.forEach(t => (t.tags || []).forEach(tag => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }));
    const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);

    const tagPillsEl = App.el('div', { class: 'nb-tag-cloud-pills' });
    if (sortedTags.length === 0) {
      tagPillsEl.appendChild(
        App.el('div', { class: 'nb-tag-cloud-empty' }, 'אין תגיות עדיין')
      );
    } else {
      sortedTags.forEach(([tag, count]) => {
        const isActive = activeTagFilter === tag;
        const pill = App.el('span', {
          class: 'nb-tag-cloud-pill' + (isActive ? ' active' : '')
        }, [
          document.createTextNode('#' + tag + ' '),
          App.el('span', { class: 'nb-tag-cloud-count' }, String(count))
        ]);
        pill.addEventListener('click', () => {
          activeTagFilter = isActive ? null : tag;
          rerender();
        });
        tagPillsEl.appendChild(pill);
      });
    }

    const clearFilterBtn = activeTagFilter
      ? App.el('button', {
          class: 'nb-sidebar-add-btn',
          title: 'נקה סינון',
          onClick: () => { activeTagFilter = null; rerender(); }
        }, '✕')
      : null;

    const tagCloudSection = App.el('div', { class: 'nb-sidebar-section nb-tag-cloud-section' }, [
      App.el('div', { class: 'nb-sidebar-title' }, [
        App.el('span', {}, '🏷️ תגיות'),
        clearFilterBtn
      ].filter(Boolean)),
      tagPillsEl
    ]);

    const left = App.el('div', { class: 'nb-topics-col' }, [
      App.el('div', { class: 'nb-sidebar-section' }, [
        App.el('div', { class: 'nb-sidebar-title' }, [
          App.el('span', {}, activeTagFilter ? ('📚 מחברות — #' + activeTagFilter) : '📚 מחברות'),
          addRootBtn
        ]),
        topicsEl
      ]),
      tagCloudSection
    ]);

    // Mobile back button (shown only in editor panel on small screens)
    const backBtn = App.el('button', {
      class: 'nb-back-btn',
      onClick: () => { mobilePanel = 'topics'; rerender(); }
    }, [
      App.el('span', {}, '→'),
      App.el('span', {}, ' כל הנושאים')
    ]);

    const right = active
      ? window.nbEditor.buildEditor(active, backBtn)
      : App.el('div', { class: 'card' }, App.el('div', { class: 'empty-state' }, 'בחר או צור נושא כדי להתחיל ←'));

    const resizer = buildResizer();

    const layoutClass = isMobile()
      ? 'nb-layout nb-mobile nb-panel-' + mobilePanel
      : 'nb-layout';

    // Wire up wiki-link clicks: clicking [[Topic Name]] navigates to that topic
    window._nbWikiClick = (tid, name) => {
      if (tid) {
        const t = getById(tid);
        if (t) { activeId = tid; rerender(); return; }
      }
      // Fallback: fuzzy match by name
      const found = getTopics().find(t => t.name === name || t.name.includes(name));
      if (found) { activeId = found.id; rerender(); }
      else App.toast('לא נמצא נושא בשם "' + name + '"');
    };

    root.append(App.el('div', { class: layoutClass }, [left, resizer, right]));
  }

  function buildResizer() {
    const r = App.el('div', { class: 'nb-resizer', title: 'גרור לשינוי רוחב' });
    r.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      r.classList.add('dragging');
      document.body.classList.add('nb-resizing');
      r.setPointerCapture?.(e.pointerId);

      const startX = e.clientX;
      const cur = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nb-sidebar-w'), 10) || 280;
      const isRtl = document.documentElement.dir === 'rtl';

      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const next = isRtl ? cur - dx : cur + dx;
        const clamped = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, next));
        document.documentElement.style.setProperty('--nb-sidebar-w', clamped + 'px');
      };

      const onUp = () => {
        r.classList.remove('dragging');
        document.body.classList.remove('nb-resizing');
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        const final = getComputedStyle(document.documentElement).getPropertyValue('--nb-sidebar-w').trim();
        try { localStorage.setItem(SIDEBAR_KEY, final); } catch {}
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });

    r.addEventListener('dblclick', () => {
      document.documentElement.style.setProperty('--nb-sidebar-w', '280px');
      try { localStorage.setItem(SIDEBAR_KEY, '280px'); } catch {}
    });

    return r;
  }

  function renderTree(parentId, depth) {
    const children = getChildren(parentId);
    const rows = [];
    children.forEach(t => {
      rows.push(renderRow(t, depth));
      if (expanded.has(t.id) && hasChildren(t.id)) {
        rows.push(...renderTree(t.id, depth + 1));
      }
    });
    return rows;
  }

  function renderRow(t, depth) {
    const has = hasChildren(t.id);
    const isExp = expanded.has(t.id);

    const chevron = App.el('div', {
      class: 't-chevron' + (has ? (isExp ? ' expanded' : '') : ' spacer'),
      onClick: (e) => {
        e.stopPropagation();
        if (!has) return;
        if (isExp) expanded.delete(t.id); else expanded.add(t.id);
        rerender();
      }
    }, '▶');

    const childCount = getChildren(t.id).length;
    const countBadge = App.el('span', { class: 't-count' }, childCount > 0 ? String(childCount) : '');

    const actionsDiv = App.el('div', { class: 't-actions' }, [
      App.el('button', {
        class: 't-act-btn',
        title: 'שינוי שם',
        onClick: (e) => {
          e.stopPropagation();
          const newName = prompt('שם הנושא:', t.name);
          if (newName !== null && newName.trim() && newName.trim() !== t.name) {
            updateTopic(t.id, { name: newName.trim() });
            rerender();
          }
        }
      }, '✏️'),
      App.el('button', {
        class: 't-act-btn',
        title: 'תת-נושא חדש',
        onClick: (e) => {
          e.stopPropagation();
          const child = createTopic(t.id);
          if (child) { activeId = child.id; rerender(); }
        }
      }, '+'),
      App.el('button', {
        class: 't-act-btn danger',
        title: 'מחיקה',
        onClick: (e) => {
          e.stopPropagation();
          deleteTopic(t.id);
          rerender();
        }
      }, '✕')
    ]);

    const row = App.el('div', {
      class: 'nb-topic' + (t.id === activeId ? ' active' : ''),
      style: { paddingInlineStart: (8 + depth * 18) + 'px' },
      onClick: (e) => {
        if (e.target.closest('.t-act-btn') || e.target.closest('.t-chevron')) return;
        activeId = t.id;
        if (isMobile()) mobilePanel = 'editor';
        rerender();
      }
    }, [
      chevron,
      App.el('span', { class: 't-icon' }, t.icon || '📓'),
      App.el('span', { class: 't-name' }, t.name),
      countBadge,
      actionsDiv
    ]);

    row.setAttribute('draggable', 'true');

    row.addEventListener('dragstart', (e) => {
      draggedId = t.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', t.id);
      setTimeout(() => row.classList.add('nb-topic-dragging'), 0);
    });

    row.addEventListener('dragend', () => {
      row.classList.remove('nb-topic-dragging');
      draggedId = null;
      document.querySelectorAll('.nb-drop-before,.nb-drop-after').forEach(el =>
        el.classList.remove('nb-drop-before', 'nb-drop-after')
      );
    });

    // Is this row a root-level notebook (no parent)?
    const isRootTopic = !t.parentId;

    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!draggedId || draggedId === t.id) return;
      if (getDescendantIds(draggedId).slice(1).includes(t.id)) return;
      document.querySelectorAll('.nb-drop-before,.nb-drop-after,.nb-drop-inside').forEach(el =>
        el.classList.remove('nb-drop-before', 'nb-drop-after', 'nb-drop-inside')
      );
      const rect = row.getBoundingClientRect();
      if (isRootTopic) {
        // Root notebooks: whole row = "drop inside"; tiny top/bottom edges = before/after
        const edge = Math.min(8, rect.height * 0.15);
        const y = e.clientY - rect.top;
        if (y < edge) row.classList.add('nb-drop-before');
        else if (y > rect.height - edge) row.classList.add('nb-drop-after');
        else row.classList.add('nb-drop-inside');
      } else {
        // Sub-notebooks: simple before/after only — no accidental nesting
        row.classList.add(e.clientY < rect.top + rect.height / 2 ? 'nb-drop-before' : 'nb-drop-after');
      }
    });

    row.addEventListener('dragleave', (e) => {
      if (!row.contains(e.relatedTarget)) {
        row.classList.remove('nb-drop-before', 'nb-drop-after', 'nb-drop-inside');
      }
    });

    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('nb-drop-before', 'nb-drop-after', 'nb-drop-inside');
      if (!draggedId || draggedId === t.id) return;
      if (getDescendantIds(draggedId).slice(1).includes(t.id)) return;

      const rect = row.getBoundingClientRect();
      const topics = getTopics();
      const draggedTopic = topics.find(x => x.id === draggedId);
      if (!draggedTopic) return;

      // Dropping ON a root notebook → move inside it as last child
      if (isRootTopic) {
        const edge = Math.min(8, rect.height * 0.15);
        const y = e.clientY - rect.top;
        if (y >= edge && y <= rect.height - edge) {
          draggedTopic.parentId = t.id;
          const children = topics
            .filter(x => x.id !== draggedId && (x.parentId || null) === t.id)
            .sort((a, b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0));
          children.push(draggedTopic);
          children.forEach((topic, i) => { topic.order = i * 10; });
          expanded.add(t.id);
          Store.set('topics', topics);
          rerender();
          return;
        }
      }

      // Before / after → reorder as siblings (keeps current parent if same group)
      const insertBefore = e.clientY < rect.top + rect.height / 2;
      const newParentId = t.parentId || null;
      draggedTopic.parentId = newParentId;
      const siblings = topics
        .filter(x => x.id !== draggedId && (x.parentId || null) === newParentId)
        .sort((a, b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0));
      const targetIdx = siblings.findIndex(x => x.id === t.id);
      if (targetIdx === -1) return;
      siblings.splice(insertBefore ? targetIdx : targetIdx + 1, 0, draggedTopic);
      siblings.forEach((topic, i) => { topic.order = i * 10; });
      Store.set('topics', topics);
      if (draggedTopic.parentId) expanded.add(draggedTopic.parentId);
      rerender();
    });

    return row;
  }

  function buildBreadcrumb(topic) {
    const path = [];
    let cur = topic;
    while (cur) {
      path.unshift(cur);
      cur = cur.parentId ? getById(cur.parentId) : null;
    }
    if (path.length <= 1) return App.el('div', { style: { display: 'none' } });
    const parts = [];
    path.forEach((p, i) => {
      if (i > 0) parts.push(App.el('span', { style: { color: 'var(--ink-mute)' } }, ' ‹ '));
      const isLast = i === path.length - 1;
      parts.push(App.el(isLast ? 'span' : 'a', {
        style: { cursor: isLast ? 'default' : 'pointer', color: isLast ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: isLast ? 500 : 400 },
        onClick: isLast ? null : () => { activeId = p.id; rerender(); }
      }, p.name || 'ללא שם'));
    });
    return App.el('div', { style: { fontSize: '12px', display: 'flex', alignItems: 'center', flexWrap: 'wrap' } }, parts);
  }

  // Tree queries + rerender exposed for sibling modules (export.js, editor.js).
  window.nbTree = { getById: getById, getChildren: getChildren, updateTopic: updateTopic, getPageContext: getPageContext, getRootAncestor: getRootAncestor, getTopics: getTopics };
  function updateTopic(id, patch) {
    const list = getTopics().map(t => t.id === id ? { ...t, ...patch } : t);
    Store.set('topics', list);
  }

  function rerender() {
    const view = document.getElementById('view');
    view.innerHTML = '';
    render(view);
  }
  window.nbCore = { rerender: rerender };
  App.register('notebook', render);
})();