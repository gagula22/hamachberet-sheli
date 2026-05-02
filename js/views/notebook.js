(function () {
  const TOPIC_ICONS = ['📓','📔','📕','📗','📘','📙','📒','📑','🗂️','📂'];
  const SIDEBAR_KEY = 'nb.sidebarW';
  const SIDEBAR_MIN = 180;
  const SIDEBAR_MAX = 600;
  let activeId = null;
  let activeEditor = null;
  const expanded = new Set();

  // Safety net: if the user closes the tab mid-debounce (within 500ms of
  // last keystroke), the editor's debounced save never fires. Flush the
  // current editor's content immediately so FirebaseSync's own pagehide
  // listener finds it in `pending` and pushes it.
  function flushActiveEditor() {
    try {
      if (activeEditor && activeEditor.saveImmediate) activeEditor.saveImmediate();
      if (window.Store && Store.saveNow) Store.saveNow();
      if (window.FirebaseSync && FirebaseSync.flush) FirebaseSync.flush();
    } catch {}
  }
  window.addEventListener('pagehide', flushActiveEditor);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushActiveEditor();
  });

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
    if (!activeId && topics.length) {
      const firstRoot = topics.find(t => !t.parentId);
      activeId = (firstRoot || topics[0]).id;
    }
    const active = getById(activeId);
    if (active && activeId !== lastRenderedId) {
      lastRenderedId = activeId;
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' }));
    }

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
      ? buildEditor(active, backBtn)
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

  function buildEditor(topic, backBtn) {
    const editor = App.el('div', {
      class: 'nb-editor',
      contenteditable: 'true',
      'data-placeholder': 'התחל לכתוב כאן… אפשר להדביק תמונות או להעלות אותן, ולשנות את גודלן בגרירת הפינה ↘'
    });
    editor.innerHTML = topic.body || '';
    restoreMoodBlocks(editor);

    const stage = App.el('div', { class: 'nb-stage' }, [editor]);

    const ctx = getPageContext(topic.id);

    function refreshPageLabels() {
      stage.querySelectorAll('.nb-page-label').forEach(l => l.remove());
      const pageH = 1100;
      const count = Math.max(1, Math.ceil(editor.scrollHeight / pageH));
      for (let i = 0; i < count; i++) {
        const lbl = App.el('div', {
          class: 'nb-page-label',
          style: { top: (i * pageH + 16) + 'px' }
        }, `עמוד ${ctx.offset + i + 1}`);
        stage.appendChild(lbl);
      }
      const stored = topic.pageCount || 1;
      if (count !== stored) {
        topic.pageCount = count;
        const list = getTopics().map(t => t.id === topic.id ? { ...t, pageCount: count } : t);
        Store.set('topics', list);
      }
    }

    function saveImmediate() {
      updateTopic(topic.id, { body: editor.innerHTML, updatedAt: Date.now() });
      refreshPageLabels();
    }
    const save = Editable.debounce(saveImmediate, 500);

    // ── Undo / Redo stack ───────────────────────────────────────────────────
    const _undoStack = [];
    let _undoPtr    = -1;
    const MAX_UNDO  = 60;

    function pushUndo() {
      const snap = editor.innerHTML;
      if (_undoPtr >= 0 && _undoStack[_undoPtr] === snap) return; // no change
      _undoStack.splice(_undoPtr + 1);           // discard forward history
      _undoStack.push(snap);
      if (_undoStack.length > MAX_UNDO) _undoStack.shift();
      else _undoPtr++;
    }

    function restoreSnapshot(snap) {
      editor.innerHTML = snap;
      restoreMoodBlocks(editor);
      Editable.attachImageBehaviors(editor, save);
      attachMoodBehaviors(editor, save);
      saveImmediate();
    }

    function doUndo() {
      if (_undoPtr <= 0) { App.toast('אין מה לבטל'); return; }
      _undoPtr--;
      restoreSnapshot(_undoStack[_undoPtr]);
      App.toast('↩ בוטל');
    }

    function doRedo() {
      if (_undoPtr >= _undoStack.length - 1) { App.toast('אין מה לשחזר'); return; }
      _undoPtr++;
      restoreSnapshot(_undoStack[_undoPtr]);
      App.toast('↪ שוחזר');
    }

    // Snapshot on load
    pushUndo();

    // Expose so editable.js image operations can push before acting
    editor._pushUndo = pushUndo;

    // Snapshot after each burst of typing (800ms quiet)
    const _debouncedPush = Editable.debounce(pushUndo, 800);
    editor.addEventListener('input', _debouncedPush);

    // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y / Ctrl+Shift+→/← direction
    editor.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault(); e.stopPropagation(); doUndo();
      } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault(); e.stopPropagation(); doRedo();
      } else if (e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        // Ctrl+Shift+→/← → toggle paragraph direction (like the template)
        e.preventDefault(); e.stopPropagation();
        dirBtn.click();
      }
    });
    // ── end undo/redo ───────────────────────────────────────────────────────

    editor.addEventListener('input', save);
    Editable.attachImageBehaviors(editor, save);
    attachMoodBehaviors(editor, save);
    wrapImagesInEditor(editor);

    // ── Paste: images from clipboard ──────────────────────────────────────
    editor.addEventListener('paste', (e) => {
      const items = (e.clipboardData && e.clipboardData.items) || [];
      for (const item of items) {
        if (item.type && item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            const named = (!file.name || file.name === 'image.png')
              ? new File([file], 'paste-' + Date.now() + '.png', { type: file.type })
              : file;
            insertImageFile(named, editor, save);
          }
          return;
        }
      }
    });

    // ── Drag-and-drop files into editor ──────────────────────────────────
    let _dragCounter = 0;
    const _dragOverlay = document.createElement('div');
    _dragOverlay.className = 'nb-drag-overlay';
    _dragOverlay.textContent = '🗂️ שחרר כאן כדי לצרף';
    document.body.appendChild(_dragOverlay);
    editor.addEventListener('dragenter', (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
        _dragCounter++;
        editor.classList.add('drag-over');
        _dragOverlay.classList.add('show');
      }
    });
    editor.addEventListener('dragover', (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    editor.addEventListener('dragleave', () => {
      _dragCounter--;
      if (_dragCounter <= 0) {
        _dragCounter = 0;
        editor.classList.remove('drag-over');
        _dragOverlay.classList.remove('show');
      }
    });
    editor.addEventListener('drop', (e) => {
      e.preventDefault();
      _dragCounter = 0;
      editor.classList.remove('drag-over');
      _dragOverlay.classList.remove('show');
      const files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      // Position cursor at drop point
      if (document.caretRangeFromPoint) {
        const r = document.caretRangeFromPoint(e.clientX, e.clientY);
        if (r) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
      } else if (document.caretPositionFromPoint) {
        const p = document.caretPositionFromPoint(e.clientX, e.clientY);
        if (p) { const r = document.createRange(); r.setStart(p.offsetNode, p.offset); r.collapse(true); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
      }
      Array.from(files).forEach((file, idx) => {
        setTimeout(() => {
          if (file.type && file.type.startsWith('image/')) insertImageFile(file, editor, save);
          else insertFileAttachment(file, editor, save);
        }, idx * 80);
      });
    });

    // ── Image: click to select, dblclick to open, resize handles ─────────
    editor.addEventListener('click', (e) => {
      const wrap = e.target.closest('.img-wrap');
      if (wrap && !e.target.classList.contains('img-resize-handle')) {
        editor.querySelectorAll('.img-wrap.selected').forEach(w => { if (w !== wrap) w.classList.remove('selected'); });
        wrap.classList.add('selected');
        try {
          const r = document.createRange(); r.setStartAfter(wrap); r.collapse(true);
          const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        } catch (_) {}
        return;
      }
      if (!e.target.closest('.img-wrap')) {
        editor.querySelectorAll('.img-wrap.selected').forEach(w => w.classList.remove('selected'));
      }
    });
    editor.addEventListener('dblclick', (e) => {
      const att = e.target.closest('.file-attachment');
      if (att) { e.preventDefault(); openAttachment(att); return; }
      if (e.target.tagName === 'IMG' && !e.target.classList.contains('file-thumb')) {
        e.preventDefault();
        const w = window.open('', '_blank');
        if (w) { w.document.write('<!DOCTYPE html><html><body style="margin:0;background:#222;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img src="' + e.target.src + '" style="max-width:100%;max-height:100vh;" /></body></html>'); w.document.close(); }
      }
    });
    editor.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('img-resize-handle')) {
        startImageResize(e, editor, save);
      }
    });

    // Store doUndo/doRedo so toolbar buttons (built below) can reference them
    editor._doUndo = doUndo;
    editor._doRedo = doRedo;

    // Track current editor module-wide so pagehide can flush even mid-debounce.
    activeEditor = { saveImmediate, editor };

    requestAnimationFrame(refreshPageLabels);
    setTimeout(refreshPageLabels, 400);

    const fileInput = App.el('input', { type: 'file', accept: 'image/*', multiple: '', style: { display: 'none' } });
    fileInput.addEventListener('change', () => {
      Array.from(fileInput.files || []).forEach(f => insertImageFile(f, editor, save));
      fileInput.value = '';
    });

    // Separate attachment input — any file type, embedded as card
    const attachInput = App.el('input', { type: 'file', style: { display: 'none' } });
    attachInput.addEventListener('change', () => {
      const f = attachInput.files && attachInput.files[0];
      if (f) insertFileAttachment(f, editor, save);
      attachInput.value = '';
    });

    try { document.execCommand('styleWithCSS', false, true); } catch {}

    function exec(cmd, val) {
      editor.focus();
      if (savedRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }
      document.execCommand(cmd, false, val);
      save();
    }
    function sep() { return App.el('div', { class: 'nb-tool-sep' }); }
    function tool(label, title, onClick, extra = {}) {
      return App.el('button', { class: 'nb-tool', title, onClick, ...extra }, label);
    }

    // Save selection before toolbar steals focus
    let savedRange = null;
    editor.addEventListener('mouseup', () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed)
        savedRange = sel.getRangeAt(0).cloneRange();
    });
    editor.addEventListener('keyup', () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed)
        savedRange = sel.getRangeAt(0).cloneRange();
    });

    function applyToSelection(styleFn) {
      editor.focus();
      const sel = window.getSelection();
      // Try live selection first, fall back to saved range
      let range = null;
      if (sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed &&
          editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        range = sel.getRangeAt(0);
      } else if (savedRange && !savedRange.collapsed &&
                 editor.contains(savedRange.commonAncestorContainer)) {
        sel.removeAllRanges();
        sel.addRange(savedRange);
        range = savedRange;
      }
      if (!range) return;

      const span = document.createElement('span');
      styleFn(span.style);
      try {
        const contents = range.extractContents();
        span.appendChild(contents);
        range.insertNode(span);
        sel.removeAllRanges();
        const r = document.createRange();
        r.selectNodeContents(span);
        sel.addRange(r);
        savedRange = r.cloneRange();
        save();
      } catch (e) { console.warn(e); }
    }

    const FONTS = [
      { v: '', label: 'גופן' },
      { v: "'Heebo', sans-serif", label: 'Heebo' },
      { v: "'Frank Ruhl Libre', serif", label: 'פרנק רוהל' },
      { v: "'Assistant', sans-serif", label: 'Assistant' },
      { v: "'Rubik', sans-serif", label: 'Rubik' },
      { v: 'Arial, sans-serif', label: 'Arial' },
      { v: '"Times New Roman", serif', label: 'Times New Roman' },
      { v: '"Courier New", monospace', label: 'Courier New' },
      { v: 'Georgia, serif', label: 'Georgia' }
    ];
    const fontSel = App.el('select', {
      class: 'nb-select',
      style: { minWidth: '110px' },
      title: 'גופן',
      onChange: (e) => {
        const v = e.target.value;
        if (!v) return;
        applyToSelection(s => { s.fontFamily = v; });
        e.target.value = '';
      }
    }, FONTS.map(f => App.el('option', { value: f.v }, f.label)));

    const SIZES = ['', '10','12','14','16','18','20','24','28','32','40','48'];
    const sizeSel = App.el('select', {
      class: 'nb-select',
      style: { minWidth: '60px' },
      title: 'גודל גופן',
      onChange: (e) => {
        const v = e.target.value;
        if (!v) return;
        applyToSelection(s => { s.fontSize = v + 'px'; });
        e.target.value = '';
      }
    }, SIZES.map(s => App.el('option', { value: s }, s || 'גודל')));

    // ── Custom colour palette (replaces native <input type=color>) ──────────
    const PALETTE = [
      '#000000','#434343','#666666','#999999','#cccccc','#ffffff',
      '#FF0000','#FF6600','#FFCC00','#00BB00','#0066FF','#9900CC',
      '#FF99AA','#FFBB77','#FFEE99','#99DD99','#99CCFF','#CC99FF',
      '#FADADD','#FFF3C4','#CDE7C1','#CFE4F7','#E6DDF4','#FAF6F0',
      '#3B3A3A','#5C3317','#1A3A5C','#1A4A1A','#4A1A4A','#2E2E5E'
    ];

    function makeColorPicker(label, title, defaultColor, onPick) {
      const swatch = App.el('span', { class: 'nb-color-swatch', style: { background: defaultColor } });
      const btn = App.el('button', { class: 'nb-color-btn', title }, [label, swatch]);
      let palette = null;

      function closePalette() { if (palette) { palette.remove(); palette = null; } }

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (palette) { closePalette(); return; }

        palette = App.el('div', { class: 'nb-color-palette' });
        PALETTE.forEach(hex => {
          const dot = App.el('button', {
            class: 'cp-dot',
            title: hex,
            style: { background: hex },
            onClick: (ev) => {
              ev.stopPropagation();
              swatch.style.background = hex;
              onPick(hex);
              closePalette();
            }
          });
          palette.appendChild(dot);
        });

        document.body.appendChild(palette);
        const r = btn.getBoundingClientRect();
        // Position below button, keep within viewport
        let left = r.left;
        const palW = 8 * 27; // 8 cols × 27px
        if (left + palW > window.innerWidth - 8) left = window.innerWidth - palW - 8;
        palette.style.top  = (r.bottom + 6) + 'px';
        palette.style.left = left + 'px';

        setTimeout(() => {
          document.addEventListener('click', function handler() {
            closePalette();
            document.removeEventListener('click', handler);
          });
        }, 0);
      });
      return btn;
    }

    const colorInput = makeColorPicker('A', 'צבע טקסט', '#3B3A3A', (hex) => {
      exec('foreColor', hex); save();
    });

    const hilightInput = makeColorPicker('✏️', 'צבע הדגשה', '#FFF3C4', (hex) => {
      editor.focus();
      if (!document.execCommand('hiliteColor', false, hex))
        document.execCommand('backColor', false, hex);
      save();
    });

    // ── Block-style select (new) ─────────────────────────────────────────
    const BLOCK_STYLES = [
      { v: 'p',          label: 'פסקה רגילה' },
      { v: 'h1',         label: 'כותרת 1' },
      { v: 'h2',         label: 'כותרת 2' },
      { v: 'h3',         label: 'כותרת 3' },
      { v: 'blockquote', label: 'ציטוט' },
      { v: 'pre',        label: 'קוד' }
    ];
    const blockStyleSel = App.el('select', {
      class: 'nb-tb-select nb-style-sel',
      title: 'סגנון בלוק',
      onChange: (e) => {
        exec('formatBlock', e.target.value === 'p' ? '<p>' : e.target.value);
      }
    }, BLOCK_STYLES.map(s => App.el('option', { value: s.v }, s.label)));

    // Live-update block style select when cursor moves
    function syncBlockStyle() {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      let node = sel.getRangeAt(0).startContainer;
      while (node && node !== editor) {
        const tag = node.nodeName && node.nodeName.toLowerCase();
        if (['h1','h2','h3','blockquote','pre'].includes(tag)) {
          blockStyleSel.value = tag; return;
        }
        node = node.parentNode;
      }
      blockStyleSel.value = 'p';
    }
    editor.addEventListener('keyup',    syncBlockStyle);
    editor.addEventListener('mouseup',  syncBlockStyle);
    editor.addEventListener('focus',    syncBlockStyle);

    // ── Ribbon font / size selects with new classes ──────────────────────
    const fontSelR = App.el('select', {
      class: 'nb-tb-select nb-font-sel',
      title: 'גופן',
      onChange: (e) => {
        const v = e.target.value;
        if (!v) return;
        applyToSelection(s => { s.fontFamily = v; });
        e.target.value = '';
      }
    }, FONTS.map(f => App.el('option', { value: f.v }, f.label)));

    const SIZES_R = ['גודל','10','12','13','14','16','18','20','24','28','32','40','48'];
    const sizeSelR = App.el('select', {
      class: 'nb-tb-select nb-size-sel',
      title: 'גודל גופן',
      onChange: (e) => {
        const v = e.target.value;
        if (v === 'גודל') return;
        applyToSelection(s => { s.fontSize = v + 'px'; });
        e.target.value = 'גודל';
      }
    }, SIZES_R.map(s => App.el('option', { value: s }, s)));

    // ── Color pickers (reuse makeColorPicker, ribbon styling) ────────────
    const colorInputR   = makeColorPicker('A',  'צבע טקסט', '#3D2F22', (hex) => { exec('foreColor', hex); });
    const hilightInputR = makeColorPicker('🖍', 'צבע הדגשה', '#FFF3C4', (hex) => {
      editor.focus();
      if (!document.execCommand('hiliteColor', false, hex))
        document.execCommand('backColor', false, hex);
      save();
    });
    colorInputR.className   = 'nb-color-btn nb-tb-color-wrap';
    hilightInputR.className = 'nb-color-btn nb-tb-color-wrap';

    // ── Direction toggle ─────────────────────────────────────────────────
    let _curDir = 'rtl';
    const dirLabel = document.createElement('span');
    dirLabel.textContent = 'עברית';
    const dirIcon = document.createElement('span');
    dirIcon.style.cssText = 'font-family:monospace;font-size:13px;font-weight:700';
    dirIcon.textContent = '→';
    const dirBtn = document.createElement('button');
    dirBtn.className = 'nb-tb-dir';
    dirBtn.title = 'כיוון פסקה (Ctrl+Shift+→/←)';
    dirBtn.appendChild(dirIcon);
    dirBtn.appendChild(dirLabel);
    dirBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      _curDir = _curDir === 'rtl' ? 'ltr' : 'rtl';
      editor.focus();
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        let block = sel.getRangeAt(0).startContainer;
        while (block && block !== editor) {
          if (block.nodeType === 1 && /^(P|H[1-6]|LI|BLOCKQUOTE|PRE|DIV)$/.test(block.nodeName)) break;
          block = block.parentNode;
        }
        if (block && block !== editor) {
          block.dir = _curDir;
          block.style.textAlign = _curDir === 'rtl' ? 'right' : 'left';
        }
      }
      dirLabel.textContent = _curDir === 'rtl' ? 'עברית' : 'English';
      dirIcon.textContent  = _curDir === 'rtl' ? '→' : '←';
      save();
    });

    // ── Export dropdown ──────────────────────────────────────────────────
    const exportDD  = document.createElement('div');
    exportDD.className = 'nb-export-dd';
    [
      { label: 'Word (.doc)', icon: '📄', action: () => showExportDialog(topic, editor, 'word') },
      { label: 'PDF (להדפסה)', icon: '🖨️', action: () => showExportDialog(topic, editor, 'pdf') }
    ].forEach(({ label, icon, action }) => {
      const item = document.createElement('div');
      item.className = 'nb-export-dd-item';
      item.innerHTML = `<span class="nb-export-dd-icon">${icon}</span><span>${label}</span>`;
      item.addEventListener('click', (e) => { e.stopPropagation(); exportDD.classList.remove('open'); action(); });
      exportDD.appendChild(item);
    });
    const exportWrap = document.createElement('div');
    exportWrap.className = 'nb-export-wrap';
    const exportBtn = document.createElement('button');
    exportBtn.className = 'nb-tb-btn nb-tb-btn-wide';
    exportBtn.title = 'ייצוא';
    exportBtn.textContent = '⤓ ייצוא ▾';
    exportBtn.addEventListener('click', (e) => { e.stopPropagation(); exportDD.classList.toggle('open'); });
    exportWrap.appendChild(exportBtn);
    exportWrap.appendChild(exportDD);
    document.addEventListener('click', () => exportDD.classList.remove('open'), { passive: true });

    // ── Focus mode ───────────────────────────────────────────────────────
    function toggleFocusMode() {
      const layout = document.querySelector('.nb-layout');
      if (!layout) return;
      const on = layout.classList.toggle('nb-focus');
      App.toast(on ? '🎯 מצב מיקוד — לחץ Escape ליציאה' : '↩ יצאת ממצב מיקוד');
    }
    editor.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        const layout = document.querySelector('.nb-layout');
        if (layout && layout.classList.contains('nb-focus')) { ev.preventDefault(); toggleFocusMode(); }
      }
    });

    // ── Insert helpers ───────────────────────────────────────────────────
    function insertLink() {
      const url = prompt('כתובת הקישור (https://…):');
      if (!url || !url.trim()) return;
      exec('createLink', url.trim());
    }
    function insertTable() {
      const td = 'style="border:1px solid #D8C9B0;padding:6px 10px"';
      const th = 'style="border:1px solid #D8C9B0;padding:6px 10px;background:#F4ECD8;font-weight:500"';
      exec('insertHTML',
        `<table dir="rtl" style="border-collapse:collapse;width:100%;margin:8px 0">` +
        `<tr><th ${th}>עמודה א</th><th ${th}>עמודה ב</th><th ${th}>עמודה ג</th></tr>` +
        `<tr><td ${td}>&nbsp;</td><td ${td}>&nbsp;</td><td ${td}>&nbsp;</td></tr>` +
        `<tr><td ${td}>&nbsp;</td><td ${td}>&nbsp;</td><td ${td}>&nbsp;</td></tr>` +
        `</table><p dir="rtl"><br></p>`);
      save();
    }
    function insertCheckboxList() {
      exec('insertHTML',
        '<ul dir="rtl" style="list-style:none;padding-right:4px">' +
        '<li><input type="checkbox"> פריט ראשון</li>' +
        '<li><input type="checkbox"> פריט שני</li>' +
        '</ul><p dir="rtl"><br></p>');
      save();
    }
    function insertWikiLink() {
      const text = prompt('שם הנושא לקישור:');
      if (!text || !text.trim()) return;
      const name = text.trim();
      // find matching topic
      const target = getTopics().find(t => t.name === name || t.name.includes(name));
      const tid = target ? target.id : null;
      const color = 'var(--nb-accent)';
      exec('insertHTML',
        `<a class="nb-wiki-link" style="color:${color};border-bottom:1px solid;cursor:pointer;text-decoration:none"` +
        ` data-wiki="${name}" data-tid="${tid || ''}" onclick="event.preventDefault();` +
        `(window._nbWikiClick&&window._nbWikiClick('${tid||''}','${name}'))">[[${name}]]</a>`
      );
      save();
    }

    // ── Helper: wrap items in a group div ────────────────────────────────
    function grp(...items) { return App.el('div', { class: 'nb-tb-group' }, items.filter(Boolean)); }

    // ── Helper: toolbar button ────────────────────────────────────────────
    function tbBtn(label, title, onClick, extra = {}) {
      return App.el('button', { class: 'nb-tb-btn', title, onClick, ...extra }, label);
    }

    // ── Build the 2-row ribbon ───────────────────────────────────────────
    const boldBtn    = tbBtn('B', 'מודגש (Ctrl+B)', () => exec('bold'),          { style: { fontWeight: '700' } });
    const italicBtn  = tbBtn('I', 'נטוי (Ctrl+I)',   () => exec('italic'),        { style: { fontStyle: 'italic', fontFamily: 'Georgia' } });
    const ulBtn      = tbBtn('U', 'קו תחתון',        () => exec('underline'),     { style: { textDecoration: 'underline' } });
    const strikeBtn  = tbBtn('S', 'קו חוצה',         () => exec('strikeThrough'), { style: { textDecoration: 'line-through' } });

    // Live active-state sync for B/I/U/S buttons
    function syncFormatState() {
      boldBtn.classList.toggle(  'nb-tb-active', document.queryCommandState('bold'));
      italicBtn.classList.toggle('nb-tb-active', document.queryCommandState('italic'));
      ulBtn.classList.toggle(   'nb-tb-active', document.queryCommandState('underline'));
      strikeBtn.classList.toggle('nb-tb-active', document.queryCommandState('strikeThrough'));
    }
    editor.addEventListener('keyup',   syncFormatState);
    editor.addEventListener('mouseup', syncFormatState);

    const ribbon = App.el('div', { class: 'nb-ribbon' }, [
      // Row 1: save/undo | block-style | font/size | B/I/U/S | colors | direction
      App.el('div', { class: 'nb-ribbon-row' }, [
        grp(
          tbBtn('💾', 'שמור (Ctrl+S)', () => { saveImmediate(); App.toast('✓ נשמר'); }),
          tbBtn('↩', 'בטל (Ctrl+Z)',   () => editor._doUndo?.()),
          tbBtn('↪', 'שחזר (Ctrl+Y)', () => editor._doRedo?.())
        ),
        grp(blockStyleSel),
        grp(fontSelR, sizeSelR),
        grp(boldBtn, italicBtn, ulBtn, strikeBtn),
        grp(colorInputR, hilightInputR),
        grp(dirBtn),
        grp((() => {
          const syncBtn = tbBtn('☁️', 'סנכרן עכשיו עם Firebase', async () => {
            if (syncBtn.dataset.syncing) return;
            syncBtn.dataset.syncing = '1';
            syncBtn.title = 'מסנכרן…';
            try {
              if (window.FirebaseSync) await FirebaseSync.flush();
              App.toast('☁️ סנכרון הושלם');
            } catch { App.toast('⚠️ סנכרון נכשל'); }
            delete syncBtn.dataset.syncing;
            syncBtn.title = 'סנכרן עכשיו עם Firebase';
          });
          return syncBtn;
        })())
      ]),
      // Row 2: align | lists | indent | insert | actions/export
      App.el('div', { class: 'nb-ribbon-row' }, [
        grp(
          tbBtn('→', 'יישור לימין', () => exec('justifyRight')),
          tbBtn('≡', 'מרכז',        () => exec('justifyCenter')),
          tbBtn('←', 'יישור לשמאל',() => exec('justifyLeft')),
          tbBtn('☰', 'מלא',          () => exec('justifyFull'))
        ),
        grp(
          tbBtn('•',  'תבליטים',       () => exec('insertUnorderedList')),
          tbBtn('1.', 'ממוספרת',        () => exec('insertOrderedList')),
          tbBtn('☑', 'רשימת משימות',  () => insertCheckboxList())
        ),
        grp(
          tbBtn('⇲', 'הזחה פנימה', () => exec('indent')),
          tbBtn('⇱', 'הזחה החוצה', () => exec('outdent'))
        ),
        grp(
          tbBtn('🔗',  'קישור חיצוני',      () => insertLink()),
          tbBtn('🖼️', 'תמונה מהמחשב',   () => fileInput.click()),
          tbBtn('📎',  'צרף קובץ',        () => attachInput.click()),
          tbBtn('⊞',   'טבלה',            () => insertTable()),
          tbBtn('⟦⟧',  'קישור פנימי [[ ]]', () => insertWikiLink()),
          tbBtn('—',   'קו מפריד',        () => { exec('insertHorizontalRule'); save(); })
        ),
        grp(
          tbBtn('📄',  'גלריית תבניות', () => openTemplateGallery(editor, save, topic.id)),
          tbBtn('🎭',  'יומן מצב רוח', () => openMoodModal(editor, save)),
          tbBtn('📌',  'הצמד נושא', () => { const pinned = !topic.pinned; updateTopic(topic.id, { pinned }); App.toast(pinned ? '📌 הוצמד' : 'הוסר מהמוצמדים'); }),
          tbBtn('🎯',  'מצב מיקוד (Escape ליציאה)', () => toggleFocusMode()),
          exportWrap
        ),
        fileInput, attachInput
      ])
    ]);

    // ── Note meta header (entity-badge + title + tags) ──────────────────
    // Entity badge — shows root notebook name in amber
    const rootAnc = getRootAncestor(topic.id);
    const badgeIcon = rootAnc ? (rootAnc.icon || '📓') : (topic.icon || '📓');
    const badgeLabel = rootAnc && rootAnc.id !== topic.id ? rootAnc.name : 'מחברת';
    const entityBadge = App.el('div', { class: 'nb-entity-badge' }, [
      App.el('span', {}, badgeIcon + ' ' + badgeLabel)
    ]);

    // Tag management
    const topicTags = Array.isArray(topic.tags) ? [...topic.tags] : [];
    const tagsRow = App.el('div', { class: 'nb-note-tags' });
    function renderTagsRow() {
      tagsRow.innerHTML = '';
      // Date pill (read-only)
      const dateStr = new Date(topic.createdAt || Date.now()).toLocaleDateString('he-IL', {
        weekday: 'long', day: 'numeric', month: 'long'
      });
      const datePill = App.el('span', { class: 'nb-note-tag nb-date-tag' }, dateStr);
      tagsRow.appendChild(datePill);
      // User tags
      topicTags.forEach((tag, idx) => {
        const pill = App.el('span', { class: 'nb-note-tag' }, [
          document.createTextNode(tag),
          App.el('span', {
            class: 'nb-tag-x',
            onClick: (e) => {
              e.stopPropagation();
              topicTags.splice(idx, 1);
              updateTopic(topic.id, { tags: [...topicTags] });
              renderTagsRow();
            }
          }, '×')
        ]);
        tagsRow.appendChild(pill);
      });
      // Add tag input
      const tagInput = App.el('input', {
        class: 'nb-tag-input',
        placeholder: '+ תגית',
        onKeydown: (e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const val = tagInput.value.trim();
            if (val && !topicTags.includes(val)) {
              topicTags.push(val);
              updateTopic(topic.id, { tags: [...topicTags] });
            }
            tagInput.value = '';
            renderTagsRow();
          } else if (e.key === 'Escape') {
            tagInput.value = '';
            tagInput.blur();
          }
        }
      });
      tagsRow.appendChild(tagInput);
    }
    renderTagsRow();

    const titleInput = App.el('input', {
      class: 'nb-title',
      placeholder: 'כותרת הנושא…',
      value: topic.name || '',
      onInput: Editable.debounce((e) => updateTopic(topic.id, { name: e.target.value }), 300),
      onBlur: () => rerender()
    });

    // Top row: entity badge + date + tags on same line
    const metaTopRow = App.el('div', { class: 'nb-meta-top-row' }, [entityBadge, tagsRow]);
    const noteMeta = App.el('div', { class: 'nb-note-meta' }, [
      metaTopRow,
      titleInput
    ]);

    const startPage = ctx.offset + 1;

    // Sync status chip — mirrors Firebase sync state, no duplicate save button
    const syncChip = App.el('span', { class: 'chip', style: { fontSize: '12px', opacity: '0.75' } }, '✓ נשמר אוטומטית');
    function updateSyncChip(state) {
      if (state === 'saving') { syncChip.textContent = '✏️ שומר…'; syncChip.style.opacity = '1'; }
      else if (state === 'saved') { const t = new Date(); syncChip.textContent = '☁️ נשמר בענן • ' + String(t.getHours()).padStart(2,'0') + ':' + String(t.getMinutes()).padStart(2,'0'); syncChip.style.opacity = '0.75'; }
      else if (state === 'error') { syncChip.textContent = '⚠️ לא סונכרן'; syncChip.style.opacity = '1'; }
    }
    // Hook into firebase-sync status updates if available
    if (window.FirebaseSync) {
      const origSet = window._nbSyncHook;
      window._nbSyncHook = updateSyncChip;
    }

    // ── Word / char count & reading time ─────────────────────────────────
    const wordCountEl = App.el('span', {});
    const charCountEl = App.el('span', {});
    const readTimeEl  = App.el('span', {});
    function updateWordCount() {
      const text = editor.innerText || '';
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      const chars = text.replace(/[\n\r]/g, '').length;
      const mins  = Math.max(1, Math.round(words / 200));
      wordCountEl.textContent = words + ' מילים';
      charCountEl.textContent = chars + ' תווים';
      readTimeEl.textContent  = '~' + mins + ' דק׳ קריאה';
    }
    updateWordCount();
    editor.addEventListener('input', updateWordCount);

    // ── Status bar ────────────────────────────────────────────────────────
    const saveDot = App.el('span', { class: 'nb-save-dot' });
    const syncStatusEl = App.el('span', {}, 'נשמר אוטומטית');
    // Override syncChip behavior to also update status bar
    const origUpdateSyncChip = updateSyncChip;
    function updateSyncChipAndDot(state) {
      origUpdateSyncChip(state);
      if (state === 'saving') {
        saveDot.className = 'nb-save-dot saving';
        syncStatusEl.textContent = 'שומר…';
      } else if (state === 'saved') {
        saveDot.className = 'nb-save-dot';
        const t = new Date();
        syncStatusEl.textContent = 'נשמר בענן • ' + String(t.getHours()).padStart(2,'0') + ':' + String(t.getMinutes()).padStart(2,'0');
      } else if (state === 'error') {
        saveDot.className = 'nb-save-dot';
        saveDot.style.background = 'var(--nb-accent-str)';
        syncStatusEl.textContent = 'לא סונכרן';
      }
    }
    window._nbSyncHook = updateSyncChipAndDot;

    const updatedStr = new Date(topic.updatedAt || Date.now()).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const pageStr = ctx.rootName ? `עמוד ${startPage} · "${ctx.rootName}"` : `עמוד ${startPage}`;

    const statusBar = App.el('div', { class: 'nb-status-bar' }, [
      App.el('div', { class: 'nb-stat-group' }, [wordCountEl, charCountEl, readTimeEl]),
      App.el('div', { class: 'nb-stat-group' }, [
        App.el('span', {}, 'עודכן: ' + updatedStr),
        App.el('span', {}, pageStr),
        App.el('span', { style: { display: 'flex', alignItems: 'center', gap: '4px' } }, [saveDot, syncStatusEl])
      ])
    ]);

    // Ribbon + noteMeta share one sticky block so both stay visible while scrolling
    const stickyHead = App.el('div', { class: 'nb-sticky-head' }, [ribbon, noteMeta]);
    return App.el('div', { class: 'nb-editor-col' }, [
      backBtn || null,
      stickyHead,
      App.el('div', { class: 'card stack' }, [stage]),
      statusBar
    ]);
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

  function _unused_insertImageFromFile(file, editor, save) {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 3 * 1024 * 1024) {
      App.toast('תמונה גדולה מדי (מעל 3MB) — בחר תמונה קטנה יותר');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      insertImage(String(reader.result), editor);
      save();
    };
    reader.readAsDataURL(file);
  }

  function insertImage(dataUrl, editor) {
    editor.focus();
    const fig = document.createElement('figure');
    fig.className = 'nb-img';
    fig.contentEditable = 'false';
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = '';
    fig.appendChild(img);

    const sel = window.getSelection();
    if (sel && sel.rangeCount && editor.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(fig);
      const space = document.createTextNode(' ');
      fig.after(space);
      const r2 = document.createRange();
      r2.setStartAfter(space);
      r2.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r2);
    } else {
      editor.appendChild(fig);
      editor.appendChild(document.createTextNode(' '));
    }
  }

  function restoreMoodBlocks(editor) {
    editor.querySelectorAll('.nb-mood-embed').forEach(block => {
      const level = block.dataset.level || '';
      block.querySelectorAll('.nb-mood-btn').forEach(b => {
        b.classList.toggle('selected', b.dataset.level === level);
      });
      const ta = block.querySelector('.nb-mood-note');
      if (ta) ta.value = block.dataset.note || '';
    });
  }

  function attachMoodBehaviors(editor, save) {
    editor.addEventListener('click', (e) => {
      const btn = e.target.closest('.nb-mood-btn');
      if (!btn) return;
      const block = btn.closest('.nb-mood-embed');
      if (!block) return;
      const level = btn.dataset.level;
      block.dataset.level = level;
      block.querySelectorAll('.nb-mood-btn').forEach(b =>
        b.classList.toggle('selected', b.dataset.level === level)
      );
      save();
    });
    editor.addEventListener('input', (e) => {
      if (e.target.classList.contains('nb-mood-note')) {
        const block = e.target.closest('.nb-mood-embed');
        if (block) { block.dataset.note = e.target.value; save(); }
      }
    }, true);
  }

  // ── Image insertion via img-wrap with corner resize handles ──────────────
  const A4_MAX_W = 640;

  function insertImageFile(file, editor, save) {
    if (!file || !file.type || !file.type.startsWith('image/')) return;
    const MAX = 8 * 1024 * 1024;
    if (file.size > MAX) {
      if (!confirm('התמונה גדולה (' + _fmtSize(file.size) + '). להמשיך?')) return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      const probe = new Image();
      probe.onload = () => {
        const initialW = Math.min(probe.naturalWidth, A4_MAX_W);
        const html = '<span class="img-wrap" contenteditable="false">'
          + '<img src="' + dataUrl + '" alt="" style="width:' + initialW + 'px;height:auto;" />'
          + '<span class="img-resize-handle br" title="גרור לשינוי גודל"></span>'
          + '<span class="img-resize-handle bl" title="גרור לשינוי גודל"></span>'
          + '<span class="img-resize-tip"></span>'
          + '</span>&nbsp;';
        editor.focus();
        document.execCommand('insertHTML', false, html);
        save();
        App.toast('תמונה נוספה (' + initialW + 'px)');
      };
      probe.onerror = () => {
        const html = '<span class="img-wrap" contenteditable="false">'
          + '<img src="' + dataUrl + '" alt="" />'
          + '<span class="img-resize-handle br"></span>'
          + '<span class="img-resize-handle bl"></span>'
          + '<span class="img-resize-tip"></span>'
          + '</span>&nbsp;';
        editor.focus();
        document.execCommand('insertHTML', false, html);
        save();
      };
      probe.src = dataUrl;
    };
    reader.onerror = () => App.toast('שגיאה בקריאת הקובץ');
    reader.readAsDataURL(file);
  }

  // Wrap plain <img> elements from old saved content with resize handles
  function wrapImagesInEditor(editor) {
    editor.querySelectorAll('img').forEach(img => {
      if (img.classList.contains('file-thumb')) return;
      if (img.closest('.img-wrap') || img.closest('figure.nb-img')) return;
      const wrap = document.createElement('span');
      wrap.className = 'img-wrap';
      wrap.setAttribute('contenteditable', 'false');
      if (!img.style.width) {
        const natW = img.naturalWidth || 0;
        if (natW > 0) {
          img.style.width = Math.min(natW, A4_MAX_W) + 'px';
          img.style.height = 'auto';
        }
      }
      img.parentNode.insertBefore(wrap, img);
      wrap.appendChild(img);
      ['br', 'bl'].forEach(pos => {
        const h = document.createElement('span');
        h.className = 'img-resize-handle ' + pos;
        h.title = 'גרור לשינוי גודל';
        wrap.appendChild(h);
      });
      const tip = document.createElement('span');
      tip.className = 'img-resize-tip';
      wrap.appendChild(tip);
    });
  }

  // Corner handle resize — called on mousedown on .img-resize-handle
  function startImageResize(e, editor, save) {
    const handle = e.target;
    const wrap = handle.closest('.img-wrap');
    if (!wrap) return;
    const img = wrap.querySelector('img');
    if (!img) return;
    e.preventDefault(); e.stopPropagation();
    const tip = wrap.querySelector('.img-resize-tip');
    const isLeft = handle.classList.contains('bl');
    const startX = e.clientX;
    const startW = img.offsetWidth || img.naturalWidth || 200;
    const startH = img.offsetHeight || img.naturalHeight || 150;
    const aspect = startH > 0 ? startW / startH : 1;
    document.body.style.cursor = isLeft ? 'nesw-resize' : 'nwse-resize';
    document.body.style.userSelect = 'none';
    wrap.classList.add('resizing');
    if (tip) tip.textContent = startW + 'px';
    function onMove(ev) {
      let dx = ev.clientX - startX;
      if (isLeft) dx = -dx;
      const newW = Math.max(60, Math.min(A4_MAX_W, Math.round(startW + dx)));
      img.style.width = newW + 'px';
      img.style.height = Math.round(newW / aspect) + 'px';
      if (tip) tip.textContent = newW + 'px' + (newW === A4_MAX_W ? ' (מקס)' : '');
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      wrap.classList.remove('resizing');
      save();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // Open a file-attachment card in a new tab (or download if not previewable)
  function openAttachment(el) {
    const dataUrl = el.dataset.content;
    const name = el.dataset.name || 'file';
    const type = el.dataset.type || '';
    if (!dataUrl) { App.toast('תוכן הקובץ חסר'); return; }
    const previewable = type.startsWith('image/') || type === 'application/pdf'
      || type.startsWith('text/') || type.startsWith('video/') || type.startsWith('audio/');
    if (previewable) {
      const w = window.open('', '_blank');
      if (w) {
        const safe = name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        if (type.startsWith('image/'))
          w.document.write('<!DOCTYPE html><html><body style="margin:0;background:#222;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img src="' + dataUrl + '" alt="' + safe + '" style="max-width:100%;max-height:100vh;"></body></html>');
        else if (type.startsWith('video/'))
          w.document.write('<!DOCTYPE html><html><body style="margin:0;background:#222;display:flex;align-items:center;justify-content:center;min-height:100vh;"><video src="' + dataUrl + '" controls autoplay style="max-width:100%;max-height:100vh;"></video></body></html>');
        else if (type.startsWith('audio/'))
          w.document.write('<!DOCTYPE html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#FAF6EE;"><audio src="' + dataUrl + '" controls autoplay></audio></body></html>');
        else
          w.document.write('<!DOCTYPE html><html><body style="margin:0;"><iframe src="' + dataUrl + '" style="width:100%;height:100vh;border:none;"></iframe></body></html>');
        w.document.close();
        return;
      }
    }
    // Download fallback
    const a = document.createElement('a');
    a.href = dataUrl; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    App.toast('הורד: ' + name);
  }

  // ── File attachment (any file type, embedded as card) ────────────────────
  function insertFileAttachment(file, editor, save) {
    const MAX = 5 * 1024 * 1024;
    if (file.size > MAX && !confirm('הקובץ גדול (' + _fmtSize(file.size) + '). להמשיך?')) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = String(ev.target.result);
      const icon = file.type.startsWith('image/') ? '🖼️'
        : file.type.includes('pdf') ? '📕'
        : (file.type.includes('word') || file.name.endsWith('.doc') || file.name.endsWith('.docx')) ? '📄'
        : (file.type.includes('excel') || file.name.endsWith('.xls') || file.name.endsWith('.xlsx')) ? '📊'
        : file.type.includes('video') ? '🎬'
        : file.type.includes('audio') ? '🎵'
        : '📎';
      const sizeStr = _fmtSize(file.size);
      const escName = file.name.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      const visual = file.type.startsWith('image/')
        ? `<img class="file-thumb" src="${dataUrl}" alt="" />`
        : `<span class="file-icon">${icon}</span>`;
      const html = `<span class="file-attachment" contenteditable="false"
        data-name="${escName}" data-type="${file.type.replace(/"/g,'')}" data-content="${dataUrl}"
        title="לחץ פעמיים לפתיחה">${visual}<span class="file-name">${escName}</span><span class="file-size">${sizeStr}</span><span class="file-hint">↗</span><button class="file-remove" title="הסר">×</button></span>&nbsp;`;
      editor.focus();
      document.execCommand('insertHTML', false, html);
      // Wire up interactions
      editor.querySelectorAll('.file-attachment:not([data-wired])').forEach(el => {
        el.setAttribute('data-wired', '1');
        el.addEventListener('dblclick', (ev) => { ev.preventDefault(); openAttachment(el); });
        const rm = el.querySelector('.file-remove');
        if (rm) rm.addEventListener('click', (e) => { e.stopPropagation(); el.remove(); save(); });
      });
      save();
      App.toast('📎 צורף: ' + file.name);
    };
    reader.onerror = () => App.toast('שגיאה בקריאת הקובץ');
    reader.readAsDataURL(file);
  }
  function _fmtSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }

  // ── Template gallery modal (full: tabs, built-in, custom, edit, save-current) ──
  const NB_BUILTIN_TEMPLATES = [
    { id: 'meeting', icon: '🤝', name: 'פגישה', desc: 'משתתפים, סדר יום, החלטות, משימות', tags: ['פגישה'],
      html: () => `<h2 dir="rtl">🤝 פגישה — ${new Date().toLocaleDateString('he-IL')}</h2><h3 dir="rtl">משתתפים</h3><ul dir="rtl"><li></li></ul><h3 dir="rtl">סדר יום</h3><ol dir="rtl"><li></li></ol><h3 dir="rtl">החלטות</h3><ul dir="rtl"><li></li></ul><h3 dir="rtl">משימות לביצוע</h3><div dir="rtl"><input type="checkbox" /> </div><div dir="rtl"><input type="checkbox" /> </div><h3 dir="rtl">פגישה הבאה</h3><p dir="rtl"></p>` },
    { id: 'idea', icon: '💡', name: 'רעיון', desc: 'בעיה, פתרון, צעדים ראשונים', tags: ['רעיון'],
      html: () => `<h2 dir="rtl">💡 רעיון: </h2><h3 dir="rtl">איזו בעיה זה פותר?</h3><p dir="rtl"></p><h3 dir="rtl">הפתרון</h3><p dir="rtl"></p><h3 dir="rtl">למי זה מיועד?</h3><p dir="rtl"></p><h3 dir="rtl">צעדים ראשונים</h3><div dir="rtl"><input type="checkbox" /> אימות הרעיון</div><div dir="rtl"><input type="checkbox" /> מחקר 30 דקות</div><div dir="rtl"><input type="checkbox" /> פרוטוטייפ ראשוני</div><h3 dir="rtl">אתגרים אפשריים</h3><ul dir="rtl"><li></li></ul>` },
    { id: 'daily', icon: '📅', name: 'יומן יומי', desc: 'מה עשיתי, מה למדתי, מחר', tags: ['יומן'],
      html: () => `<h2 dir="rtl">📅 ${new Date().toLocaleDateString('he-IL')}</h2><h3 dir="rtl">מצב רוח &amp; אנרגיה</h3><p dir="rtl">😊😐😔  ·  אנרגיה: ▢▢▢▢▢</p><h3 dir="rtl">מה עשיתי היום</h3><ul dir="rtl"><li></li></ul><h3 dir="rtl">מה למדתי?</h3><p dir="rtl"></p><h3 dir="rtl">3 דברים שאני מודה עליהם</h3><ol dir="rtl"><li></li><li></li><li></li></ol><h3 dir="rtl">למחר</h3><div dir="rtl"><input type="checkbox" /> </div><div dir="rtl"><input type="checkbox" /> </div><div dir="rtl"><input type="checkbox" /> </div>` },
    { id: 'reading', icon: '📚', name: 'הערות קריאה', desc: 'ספר, ציטוטים, מחשבות', tags: ['קריאה'],
      html: () => `<h2 dir="rtl">📚 הערות קריאה</h2><p dir="rtl"><strong>שם:</strong> </p><p dir="rtl"><strong>מחבר:</strong> </p><p dir="rtl"><strong>סוגה:</strong>   ·  <strong>דירוג:</strong> ⭐⭐⭐⭐⭐</p><h3 dir="rtl">תקציר במשפט אחד</h3><p dir="rtl"></p><h3 dir="rtl">3 התובנות המרכזיות</h3><ol dir="rtl"><li></li><li></li><li></li></ol><h3 dir="rtl">ציטוטים</h3><blockquote dir="rtl"></blockquote><h3 dir="rtl">איך אני מיישם את זה?</h3><p dir="rtl"></p>` },
    { id: 'goal', icon: '🎯', name: 'הגדרת מטרה', desc: 'SMART, צעדים, מועד יעד', tags: ['מטרה'],
      html: () => `<h2 dir="rtl">🎯 מטרה: </h2><h3 dir="rtl">למה?</h3><p dir="rtl">למה זה חשוב לי?</p><h3 dir="rtl">SMART</h3><ul dir="rtl"><li><strong>ספציפי:</strong> </li><li><strong>מדיד:</strong> </li><li><strong>בר-השגה:</strong> </li><li><strong>רלוונטי:</strong> </li><li><strong>מוגבל בזמן:</strong> עד </li></ul><h3 dir="rtl">צעדים לביצוע</h3><div dir="rtl"><input type="checkbox" /> </div><div dir="rtl"><input type="checkbox" /> </div><div dir="rtl"><input type="checkbox" /> </div><h3 dir="rtl">איך אדע שהצלחתי?</h3><p dir="rtl"></p><h3 dir="rtl">מה עלול לעצור אותי?</h3><p dir="rtl"></p>` },
    { id: 'todo', icon: '✅', name: 'רשימת משימות', desc: 'משימות לפי עדיפות', tags: ['משימות'],
      html: () => `<h2 dir="rtl">✅ משימות — ${new Date().toLocaleDateString('he-IL')}</h2><h3 dir="rtl">🔥 דחוף וחשוב</h3><div dir="rtl"><input type="checkbox" /> </div><h3 dir="rtl">⭐ חשוב (לא דחוף)</h3><div dir="rtl"><input type="checkbox" /> </div><div dir="rtl"><input type="checkbox" /> </div><h3 dir="rtl">⚡ דחוף (לא חשוב)</h3><div dir="rtl"><input type="checkbox" /> </div><h3 dir="rtl">📋 כשיהיה זמן</h3><div dir="rtl"><input type="checkbox" /> </div>` },
    { id: 'shopping', icon: '🛒', name: 'רשימת קניות', desc: 'מצרכים מסודרים לפי חנות', tags: ['קניות'],
      html: () => `<h2 dir="rtl">🛒 קניות — ${new Date().toLocaleDateString('he-IL')}</h2><h3 dir="rtl">סופר</h3><div dir="rtl"><input type="checkbox" /> </div><div dir="rtl"><input type="checkbox" /> </div><div dir="rtl"><input type="checkbox" /> </div><h3 dir="rtl">ירקן</h3><div dir="rtl"><input type="checkbox" /> </div><div dir="rtl"><input type="checkbox" /> </div><h3 dir="rtl">מאפייה</h3><div dir="rtl"><input type="checkbox" /> </div><h3 dir="rtl">פארם</h3><div dir="rtl"><input type="checkbox" /> </div>` },
    { id: 'trip', icon: '✈️', name: 'תכנון טיול', desc: 'יעד, אריזה, יומן יומי', tags: ['טיול'],
      html: () => `<h2 dir="rtl">✈️ טיול: </h2><p dir="rtl"><strong>יעד:</strong>   ·  <strong>תאריכים:</strong> </p><p dir="rtl"><strong>תקציב משוער:</strong> </p><h3 dir="rtl">טיסות / תחבורה</h3><p dir="rtl"></p><h3 dir="rtl">מלון / לינה</h3><p dir="rtl"></p><h3 dir="rtl">תכנית יומית</h3><p dir="rtl"><strong>יום 1:</strong> </p><p dir="rtl"><strong>יום 2:</strong> </p><p dir="rtl"><strong>יום 3:</strong> </p><h3 dir="rtl">רשימת אריזה</h3><div dir="rtl"><input type="checkbox" /> דרכון / ת.ז.</div><div dir="rtl"><input type="checkbox" /> כרטיסי טיסה</div><div dir="rtl"><input type="checkbox" /> מטענים / מתאמים</div><div dir="rtl"><input type="checkbox" /> ביטוח נסיעות</div><div dir="rtl"><input type="checkbox" /> תרופות</div><h3 dir="rtl">לזכור</h3><ul dir="rtl"><li></li></ul>` },
    { id: 'budget', icon: '💰', name: 'תקציב חודשי', desc: 'הכנסות והוצאות', tags: ['תקציב'],
      html: () => `<h2 dir="rtl">💰 תקציב — </h2><p dir="rtl"><strong>חודש:</strong>   ·  <strong>סטטוס:</strong> </p><h3 dir="rtl">הכנסות</h3><table style="border-collapse:collapse;width:100%"><tr><th style="background:#F4ECD8;border:1px solid #D8C9B0;padding:6px">מקור</th><th style="background:#F4ECD8;border:1px solid #D8C9B0;padding:6px">סכום</th></tr><tr><td style="border:1px solid #D8C9B0;padding:6px"></td><td style="border:1px solid #D8C9B0;padding:6px"></td></tr><tr><td style="border:1px solid #D8C9B0;padding:6px"></td><td style="border:1px solid #D8C9B0;padding:6px"></td></tr></table><h3 dir="rtl">הוצאות</h3><table style="border-collapse:collapse;width:100%"><tr><th style="background:#F4ECD8;border:1px solid #D8C9B0;padding:6px">קטגוריה</th><th style="background:#F4ECD8;border:1px solid #D8C9B0;padding:6px">מתוכנן</th><th style="background:#F4ECD8;border:1px solid #D8C9B0;padding:6px">בפועל</th></tr><tr><td style="border:1px solid #D8C9B0;padding:6px">שכר דירה</td><td style="border:1px solid #D8C9B0;padding:6px"></td><td style="border:1px solid #D8C9B0;padding:6px"></td></tr><tr><td style="border:1px solid #D8C9B0;padding:6px">מזון</td><td style="border:1px solid #D8C9B0;padding:6px"></td><td style="border:1px solid #D8C9B0;padding:6px"></td></tr><tr><td style="border:1px solid #D8C9B0;padding:6px">תחבורה</td><td style="border:1px solid #D8C9B0;padding:6px"></td><td style="border:1px solid #D8C9B0;padding:6px"></td></tr><tr><td style="border:1px solid #D8C9B0;padding:6px">בילויים</td><td style="border:1px solid #D8C9B0;padding:6px"></td><td style="border:1px solid #D8C9B0;padding:6px"></td></tr></table><h3 dir="rtl">תובנות</h3><p dir="rtl"></p>` },
    { id: 'recipe', icon: '🍳', name: 'מתכון', desc: 'מצרכים והוראות הכנה', tags: ['מתכון'],
      html: () => `<h2 dir="rtl">🍳 </h2><p dir="rtl"><strong>מנות:</strong>   ·  <strong>זמן הכנה:</strong>  דק׳  ·  <strong>זמן בישול:</strong>  דק׳</p><p dir="rtl"><strong>רמת קושי:</strong> ⭐⭐</p><h3 dir="rtl">מצרכים</h3><ul dir="rtl"><li> </li><li> </li><li> </li></ul><h3 dir="rtl">הוראות הכנה</h3><ol dir="rtl"><li></li><li></li><li></li></ol><h3 dir="rtl">טיפים</h3><ul dir="rtl"><li></li></ul><h3 dir="rtl">הערות אישיות</h3><p dir="rtl"></p>` },
    { id: 'review', icon: '📔', name: 'סיכום שבועי', desc: 'הצלחות, אתגרים, מטרות', tags: ['סיכום שבועי'],
      html: () => `<h2 dir="rtl">📔 סיכום שבוע — ${new Date().toLocaleDateString('he-IL')}</h2><h3 dir="rtl">⭐ 3 הצלחות השבוע</h3><ol dir="rtl"><li></li><li></li><li></li></ol><h3 dir="rtl">📚 מה למדתי</h3><p dir="rtl"></p><h3 dir="rtl">🌱 איפה התקדמתי</h3><p dir="rtl"></p><h3 dir="rtl">⚠️ אתגרים / תקיעות</h3><p dir="rtl"></p><h3 dir="rtl">🎯 3 מטרות לשבוע הבא</h3><div dir="rtl"><input type="checkbox" /> </div><div dir="rtl"><input type="checkbox" /> </div><div dir="rtl"><input type="checkbox" /> </div><h3 dir="rtl">דירוג כללי לשבוע</h3><p dir="rtl">⭐⭐⭐⭐⭐</p>` },
    { id: 'project', icon: '💼', name: 'תכנון פרויקט', desc: 'מטרה, אבני דרך, סיכונים', tags: ['פרויקט'],
      html: () => `<h2 dir="rtl">💼 פרויקט: </h2><p dir="rtl"><strong>סטטוס:</strong>  · <strong>תאריך התחלה:</strong>  · <strong>יעד סיום:</strong> </p><h3 dir="rtl">מטרת על</h3><p dir="rtl"></p><h3 dir="rtl">תוצרים מצופים</h3><ul dir="rtl"><li></li></ul><h3 dir="rtl">אבני דרך</h3><div dir="rtl"><input type="checkbox" /> אבן דרך 1 — </div><div dir="rtl"><input type="checkbox" /> אבן דרך 2 — </div><div dir="rtl"><input type="checkbox" /> אבן דרך 3 — </div><h3 dir="rtl">משאבים נדרשים</h3><ul dir="rtl"><li></li></ul><h3 dir="rtl">משימות פתוחות</h3><div dir="rtl"><input type="checkbox" /> </div>` },
    { id: 'brainstorm', icon: '🧠', name: 'סיעור מוחות', desc: 'רעיונות חופשיים ובחירה', tags: ['רעיון'],
      html: () => `<h2 dir="rtl">🧠 סיעור מוחות: </h2><h3 dir="rtl">השאלה / הבעיה</h3><p dir="rtl"></p><h3 dir="rtl">רעיונות (אל תשפוט, רק רשום)</h3><ul dir="rtl"><li></li><li></li><li></li><li></li><li></li><li></li></ul><h3 dir="rtl">3 הטובים ביותר</h3><ol dir="rtl"><li></li><li></li><li></li></ol><h3 dir="rtl">המנצח</h3><p dir="rtl"></p><h3 dir="rtl">צעדים הבאים</h3><div dir="rtl"><input type="checkbox" /> </div>` },
    { id: 'standup', icon: '💬', name: 'סטנדאפ צוות', desc: 'מה עשיתי, מה אעשה, חסמים', tags: ['פגישה', 'סטנדאפ'],
      html: () => `<h2 dir="rtl">💬 סטנדאפ — ${new Date().toLocaleDateString('he-IL')}</h2><h3 dir="rtl">מה עשיתי אתמול?</h3><ul dir="rtl"><li></li></ul><h3 dir="rtl">מה אעשה היום?</h3><ul dir="rtl"><li></li></ul><h3 dir="rtl">חסמים?</h3><p dir="rtl"></p><h3 dir="rtl">דברים לשתף עם הצוות</h3><p dir="rtl"></p>` }
  ];

  function openTemplateGallery(editor, save, topicId) {
    const esc = (s) => String(s).replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const tplUid = () => 'tpl_' + Math.random().toString(36).slice(2,8) + Date.now().toString(36).slice(-4);
    function getCustom() { return Store.get('customTemplates') || []; }
    function setCustom(arr) { Store.set('customTemplates', arr); }

    // Remove existing overlay if any
    document.getElementById('_nb_tpl_overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = '_nb_tpl_overlay';
    overlay.className = 'nb-tpl-overlay';

    const modal = document.createElement('div');
    modal.className = 'nb-tpl-modal';
    modal.style.cssText = 'padding:0;overflow:hidden;display:flex;flex-direction:column;';

    // ── Header ──
    const head = document.createElement('div');
    head.className = 'nb-tpl-head';
    head.style.cssText = 'padding:18px 20px 0;flex-shrink:0;';
    head.innerHTML = '<h3 style="font-size:17px;font-weight:600;">📄 בחר תבנית</h3>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'nb-tpl-close';
    closeBtn.textContent = '×';
    closeBtn.onclick = () => overlay.remove();
    head.appendChild(closeBtn);

    // ── Tabs ──
    const tabsBar = document.createElement('div');
    tabsBar.style.cssText = 'display:flex;gap:0;border-bottom:1px solid var(--nb-border-soft);margin:12px 20px 0;flex-shrink:0;';
    const tabBuiltin = document.createElement('button');
    const tabCustom  = document.createElement('button');
    tabBuiltin.textContent = 'תבניות מובנות';
    tabCustom.textContent  = 'התבניות שלי';
    [tabBuiltin, tabCustom].forEach(t => {
      t.style.cssText = 'padding:8px 16px;border:none;background:transparent;cursor:pointer;font-size:13px;color:var(--nb-text-3);border-bottom:2px solid transparent;margin-bottom:-1px;font-family:Heebo,sans-serif;';
    });
    tabsBar.appendChild(tabBuiltin);
    tabsBar.appendChild(tabCustom);

    // ── Grids container ──
    const gridsWrap = document.createElement('div');
    gridsWrap.style.cssText = 'flex:1;overflow-y:auto;padding:14px 20px 0;';

    const gridBuiltin = document.createElement('div');
    const gridCustom  = document.createElement('div');
    gridBuiltin.className = gridCustom.className = 'nb-tpl-grid';

    // ── Save current button ──
    const saveCurrentBtn = document.createElement('button');
    saveCurrentBtn.style.cssText = 'margin:12px 20px 16px;padding:10px 16px;background:var(--nb-bg-page);border:1px dashed var(--nb-accent-soft,#C9826A);border-radius:8px;font-size:13px;color:var(--nb-accent-str,#8C4A2C);width:calc(100% - 40px);font-weight:500;cursor:pointer;font-family:Heebo,sans-serif;flex-shrink:0;';
    saveCurrentBtn.textContent = '💾 שמור הערה זו כתבנית חדשה';
    saveCurrentBtn.onmouseover = () => { saveCurrentBtn.style.background = 'var(--nb-bg-tag)'; saveCurrentBtn.style.borderStyle = 'solid'; };
    saveCurrentBtn.onmouseout  = () => { saveCurrentBtn.style.background = 'var(--nb-bg-page)'; saveCurrentBtn.style.borderStyle = 'dashed'; };

    gridsWrap.appendChild(gridBuiltin);
    gridsWrap.appendChild(gridCustom);
    modal.appendChild(head);
    modal.appendChild(tabsBar);
    modal.appendChild(gridsWrap);
    modal.appendChild(saveCurrentBtn);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // ── Render grid ──
    function renderGrids(activeTab) {
      // Tab styles
      if (activeTab === 'builtin') {
        tabBuiltin.style.color = 'var(--nb-accent-str,#8C4A2C)';
        tabBuiltin.style.fontWeight = '600';
        tabBuiltin.style.borderBottomColor = 'var(--nb-accent,#B8762A)';
        tabCustom.style.color = 'var(--nb-text-3)';
        tabCustom.style.fontWeight = '400';
        tabCustom.style.borderBottomColor = 'transparent';
      } else {
        tabCustom.style.color = 'var(--nb-accent-str,#8C4A2C)';
        tabCustom.style.fontWeight = '600';
        tabCustom.style.borderBottomColor = 'var(--nb-accent,#B8762A)';
        tabBuiltin.style.color = 'var(--nb-text-3)';
        tabBuiltin.style.fontWeight = '400';
        tabBuiltin.style.borderBottomColor = 'transparent';
      }
      gridBuiltin.style.display = activeTab === 'builtin' ? 'grid' : 'none';
      gridCustom.style.display  = activeTab === 'custom'  ? 'grid' : 'none';

      // Built-in cards
      if (activeTab === 'builtin' && !gridBuiltin._rendered) {
        gridBuiltin._rendered = true;
        NB_BUILTIN_TEMPLATES.forEach(t => {
          const card = document.createElement('div');
          card.className = 'nb-tpl-card';
          card.style.position = 'relative';
          card.innerHTML = '<span class="nb-tpl-icon">' + t.icon + '</span><div class="nb-tpl-name">' + esc(t.name) + '</div><div class="nb-tpl-desc">' + esc(t.desc) + '</div>';
          // Edit button (fork to custom)
          const editBtn = document.createElement('span');
          editBtn.textContent = '✏️';
          editBtn.title = 'צור עותק שלי לעריכה';
          editBtn.style.cssText = 'display:none;position:absolute;top:4px;right:4px;background:var(--nb-accent);color:white;border-radius:50%;width:18px;height:18px;font-size:10px;align-items:center;justify-content:center;cursor:pointer;line-height:1;';
          card.appendChild(editBtn);
          card.onmouseenter = () => { editBtn.style.display = 'flex'; };
          card.onmouseleave = () => { editBtn.style.display = 'none'; };
          editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            forkBuiltinTemplate(t);
          });
          card.addEventListener('click', () => applyTemplate(t.html(), t.name, t.tags || []));
          gridBuiltin.appendChild(card);
        });
      }

      // Custom cards
      if (activeTab === 'custom') {
        gridCustom.innerHTML = '';
        const customs = getCustom();
        if (customs.length === 0) {
          gridCustom.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px 20px;color:var(--nb-text-3);font-size:13px;"><div style="font-size:32px;margin-bottom:8px">📭</div><div>עדיין אין תבניות שלך.</div><div style="font-size:11px;margin-top:6px;">לחץ \'💾 שמור הערה זו כתבנית חדשה\' למטה.</div></div>';
        } else {
          customs.forEach(t => {
            const card = document.createElement('div');
            card.className = 'nb-tpl-card';
            card.style.cssText = 'position:relative;border-style:dashed;';
            card.innerHTML = '<span class="nb-tpl-icon">' + (t.icon || '📝') + '</span><div class="nb-tpl-name">' + esc(t.name) + '</div><div class="nb-tpl-desc">תבנית מותאמת אישית</div>';
            // Edit button
            const editBtn = document.createElement('span');
            editBtn.textContent = '✏️';
            editBtn.title = 'ערוך תבנית';
            editBtn.style.cssText = 'display:none;position:absolute;top:4px;right:4px;background:var(--nb-accent);color:white;border-radius:50%;width:18px;height:18px;font-size:10px;align-items:center;justify-content:center;cursor:pointer;line-height:1;';
            // Delete button
            const delBtn = document.createElement('span');
            delBtn.textContent = '×';
            delBtn.title = 'מחק תבנית';
            delBtn.style.cssText = 'display:none;position:absolute;top:4px;left:4px;background:#B5453F;color:white;border-radius:50%;width:18px;height:18px;font-size:13px;align-items:center;justify-content:center;cursor:pointer;line-height:1;';
            card.appendChild(editBtn);
            card.appendChild(delBtn);
            card.onmouseenter = () => { editBtn.style.display = 'flex'; delBtn.style.display = 'flex'; card.style.borderStyle = 'solid'; };
            card.onmouseleave = () => { editBtn.style.display = 'none'; delBtn.style.display = 'none'; card.style.borderStyle = 'dashed'; };
            editBtn.addEventListener('click', (e) => { e.stopPropagation(); startEditCustomTemplate(t.id); });
            delBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              if (!confirm('למחוק את התבנית "' + t.name + '"?')) return;
              setCustom(getCustom().filter(x => x.id !== t.id));
              App.toast('התבנית נמחקה');
              renderGrids('custom');
            });
            card.addEventListener('click', () => applyTemplate(t.html, t.name));
            gridCustom.appendChild(card);
          });
        }
      }
    }

    function applyTemplate(html, name, tags) {
      editor.focus();
      document.execCommand('insertHTML', false, html);
      save();
      // Auto-add template tags to the current topic (if any)
      if (tags && tags.length && topicId) {
        const current = getById(topicId);
        if (current) {
          const existing = Array.isArray(current.tags) ? current.tags : [];
          const merged = [...existing];
          tags.forEach(t => { if (!merged.includes(t)) merged.push(t); });
          if (merged.length !== existing.length) {
            updateTopic(topicId, { tags: merged });
          }
        }
      }
      overlay.remove();
      App.toast('✓ תבנית "' + name + '" הוכנסה');
    }

    function forkBuiltinTemplate(t) {
      const name = prompt('שם לעותק החדש:', t.name + ' (שלי)');
      if (!name || !name.trim()) return;
      const customs = getCustom();
      const newTpl = { id: tplUid(), name: name.trim(), icon: t.icon, html: t.html(), createdAt: Date.now() };
      customs.push(newTpl);
      setCustom(customs);
      App.toast('עותק נוצר — עורך מצב עריכה');
      overlay.remove();
      setTimeout(() => startEditCustomTemplateById(newTpl.id, editor, save), 80);
    }

    function startEditCustomTemplate(tplId) {
      overlay.remove();
      setTimeout(() => startEditCustomTemplateById(tplId, editor, save), 80);
    }

    saveCurrentBtn.addEventListener('click', () => {
      const html = editor.innerHTML || '';
      if (!html.trim() || html === '<br>') { App.toast('אין תוכן בהערה הנוכחית'); return; }
      const name = prompt('שם התבנית:');
      if (!name || !name.trim()) return;
      const icon = prompt('אימוג\'י לתבנית (השאר ריק ל-📝):', '📝') || '📝';
      const customs = getCustom();
      customs.push({ id: tplUid(), name: name.trim(), icon: icon.trim() || '📝', html: html, createdAt: Date.now() });
      setCustom(customs);
      App.toast('💾 נשמרה תבנית: ' + name);
      overlay.remove();
      setTimeout(() => { openTemplateGallery(editor, save, topicId); renderGrids('custom'); }, 200);
    });

    tabBuiltin.addEventListener('click', () => renderGrids('builtin'));
    tabCustom.addEventListener('click',  () => renderGrids('custom'));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.addEventListener('keydown', function escClose(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escClose); }
    });

    renderGrids('builtin');
  }

  // Edit a custom template by loading it into the editor with a banner
  function startEditCustomTemplateById(tplId, editor, save) {
    const customs = Store.get('customTemplates') || [];
    const tpl = customs.find(t => t.id === tplId);
    if (!tpl) return;
    // Inject edit banner above editor-col
    const editorCol = editor.closest('.nb-editor-col');
    if (!editorCol) return;
    // Remove any existing banner
    editorCol.querySelector('.nb-tpl-edit-banner')?.remove();
    const banner = document.createElement('div');
    banner.className = 'nb-tpl-edit-banner';
    banner.innerHTML = '<span>🔧 עורך תבנית: <strong>' + tpl.name + '</strong> ' + (tpl.icon || '') + '</span>';
    const actions = document.createElement('span');
    actions.style.cssText = 'display:flex;gap:8px;';
    const saveBtn   = document.createElement('button');
    const cancelBtn = document.createElement('button');
    saveBtn.textContent   = '💾 שמור שינויים';
    cancelBtn.textContent = '✕ בטל';
    saveBtn.className   = 'nb-tpl-banner-save';
    cancelBtn.className = 'nb-tpl-banner-cancel';
    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    banner.appendChild(actions);
    editorCol.insertBefore(banner, editorCol.firstChild);
    // Load template content into editor
    const origContent = editor.innerHTML;
    editor.innerHTML = tpl.html;
    saveBtn.addEventListener('click', () => {
      const cs = Store.get('customTemplates') || [];
      const idx = cs.findIndex(t => t.id === tplId);
      if (idx !== -1) { cs[idx].html = editor.innerHTML; Store.set('customTemplates', cs); }
      editor.innerHTML = origContent;
      banner.remove();
      save();
      App.toast('✓ התבנית עודכנה: ' + tpl.name);
    });
    cancelBtn.addEventListener('click', () => {
      editor.innerHTML = origContent;
      banner.remove();
      App.toast('עריכת התבנית בוטלה');
    });
  }

  // ── Mood journal modal ────────────────────────────────────────────────────
  function openMoodModal(editor, save) {
    const overlay = document.createElement('div');
    overlay.className = 'nb-tpl-overlay';
    const modal = document.createElement('div');
    modal.className = 'nb-tpl-modal nb-mood-modal';

    modal.innerHTML = `
<div class="nb-tpl-head">
  <h3>🎭 רישום מצב רוח</h3>
  <button class="nb-tpl-close" id="_moodX">×</button>
</div>
<div class="nb-mood-section">
  <span class="nb-mood-label">איך אני מרגיש עכשיו?</span>
  <div class="nb-mood-emojis">
    <span class="nb-mood-emoji" data-mood="great">😄<div class="nb-mood-tip">מצוין</div></span>
    <span class="nb-mood-emoji" data-mood="good">😊<div class="nb-mood-tip">טוב</div></span>
    <span class="nb-mood-emoji" data-mood="okay">😐<div class="nb-mood-tip">בסדר</div></span>
    <span class="nb-mood-emoji" data-mood="bad">😟<div class="nb-mood-tip">לא טוב</div></span>
    <span class="nb-mood-emoji" data-mood="awful">😢<div class="nb-mood-tip">גרוע</div></span>
  </div>
</div>
<div class="nb-mood-section">
  <span class="nb-mood-label">⚡ רמת אנרגיה</span>
  <div class="nb-mood-stars" id="_energyS">
    <span class="nb-mood-star" data-val="1">★</span><span class="nb-mood-star" data-val="2">★</span>
    <span class="nb-mood-star" data-val="3">★</span><span class="nb-mood-star" data-val="4">★</span>
    <span class="nb-mood-star" data-val="5">★</span>
  </div>
</div>
<div class="nb-mood-section">
  <span class="nb-mood-label">😴 איכות שינה אתמול</span>
  <div class="nb-mood-stars" id="_sleepS">
    <span class="nb-mood-star" data-val="1">★</span><span class="nb-mood-star" data-val="2">★</span>
    <span class="nb-mood-star" data-val="3">★</span><span class="nb-mood-star" data-val="4">★</span>
    <span class="nb-mood-star" data-val="5">★</span>
  </div>
</div>
<div class="nb-mood-section">
  <span class="nb-mood-label">💭 מה השפיע על מצב הרוח שלי?</span>
  <textarea class="nb-mood-textarea" id="_moodTxt" placeholder="כל מה שמתחשק לרשום..."></textarea>
</div>
<div class="nb-mood-section">
  <span class="nb-mood-label">🙏 3 דברים שאני מודה עליהם</span>
  <input class="nb-mood-input" id="_g1" placeholder="1." /><input class="nb-mood-input" id="_g2" placeholder="2." /><input class="nb-mood-input" id="_g3" placeholder="3." />
</div>
<div class="nb-tpl-actions">
  <button class="nb-tpl-btn-primary" id="_moodSave">💾 שמור ביומן</button>
  <button class="nb-tpl-btn-secondary" id="_moodCancel">ביטול</button>
</div>`;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    modal.querySelector('#_moodX').onclick      = () => overlay.remove();
    modal.querySelector('#_moodCancel').onclick = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    let selectedMood = '';
    let energyRating = 0;
    let sleepRating  = 0;

    modal.querySelectorAll('.nb-mood-emoji').forEach(el => {
      el.addEventListener('click', () => {
        modal.querySelectorAll('.nb-mood-emoji').forEach(e2 => e2.classList.remove('selected'));
        el.classList.add('selected');
        selectedMood = el.dataset.mood;
      });
    });

    function setupStars(groupId, onPick) {
      const stars = modal.querySelectorAll('#' + groupId + ' .nb-mood-star');
      stars.forEach(s => {
        s.addEventListener('click', () => {
          const v = parseInt(s.dataset.val);
          onPick(v);
          stars.forEach(s2 => s2.classList.toggle('lit', parseInt(s2.dataset.val) <= v));
        });
      });
    }
    setupStars('_energyS', v => { energyRating = v; });
    setupStars('_sleepS',  v => { sleepRating  = v; });

    modal.querySelector('#_moodSave').addEventListener('click', () => {
      const LABELS = { great: 'מצוין 😄', good: 'טוב 😊', okay: 'בסדר 😐', bad: 'לא טוב 😟', awful: 'גרוע 😢' };
      const moodLbl  = LABELS[selectedMood] || '—';
      const energyStr = energyRating ? '★'.repeat(energyRating) + '☆'.repeat(5 - energyRating) : '—';
      const sleepStr  = sleepRating  ? '★'.repeat(sleepRating)  + '☆'.repeat(5 - sleepRating)  : '—';
      const txt = modal.querySelector('#_moodTxt').value;
      const gratitude = [modal.querySelector('#_g1').value, modal.querySelector('#_g2').value, modal.querySelector('#_g3').value]
        .filter(Boolean).map((g, i) => `<li dir="rtl">${i + 1}. ${g}</li>`).join('');
      const date = new Date().toLocaleDateString('he-IL');

      const BG   = '#E8F5F8';
      const BOR  = '#A8D8E8';
      const LBL  = '#2B6E82';
      const html = `<div dir="rtl" style="background:${BG};border:1px solid ${BOR};border-radius:12px;padding:16px 20px;margin:12px 0;font-family:'Heebo',sans-serif;">
<div style="font-size:11px;color:${LBL};margin-bottom:10px;font-weight:600;letter-spacing:0.3px;">🎭 יומן מצב רוח · ${date}</div>
<div style="display:flex;flex-wrap:wrap;gap:14px;font-size:13px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid ${BOR};">
  <span><strong>מצב רוח:</strong> ${moodLbl}</span>
  <span><strong>אנרגיה:</strong> ${energyStr}</span>
  <span><strong>שינה:</strong> ${sleepStr}</span>
</div>
${txt ? `<div style="margin-bottom:10px;">
  <div style="font-size:12px;font-weight:600;color:${LBL};margin-bottom:4px;">💭 מה השפיע על מצב הרוח שלי?</div>
  <div style="font-size:13px;color:#2C4A55;padding:8px 12px;background:rgba(255,255,255,0.65);border-radius:8px;white-space:pre-wrap;">${txt.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
</div>` : ''}
${gratitude ? `<div>
  <div style="font-size:12px;font-weight:600;color:${LBL};margin-bottom:6px;">🙏 3 דברים שאני מודה עליהם</div>
  <ol dir="rtl" style="margin:0;padding-right:20px;font-size:13px;color:#2C4A55;">${gratitude}</ol>
</div>` : ''}
</div><p dir="rtl"><br></p>`;

      editor.focus();
      document.execCommand('insertHTML', false, html);
      save();
      overlay.remove();
      App.toast('🎭 נרשם ביומן מצב הרוח');
    });
  }

  function insertMoodBlock(editor, save) {
    editor.focus();
    const id = Store.uid();
    const block = document.createElement('div');
    block.className = 'nb-mood-embed';
    block.contentEditable = 'false';
    block.dataset.moodId = id;
    block.dataset.level = '';
    block.dataset.note = '';
    const EMOJIS = ['😞','😕','😐','🙂','😄'];
    block.innerHTML =
      '<div class="nb-mood-embed-header"><span>🎭</span><span>יומן מצב רוח</span></div>' +
      '<div class="nb-mood-embed-row">' +
        '<span class="nb-mood-embed-q">איך אתה מרגיש היום?</span>' +
        '<div class="nb-mood-embed-picker">' +
          EMOJIS.map((e, i) => `<button class="nb-mood-btn" data-level="${i + 1}" type="button">${e}</button>`).join('') +
        '</div>' +
      '</div>' +
      '<textarea class="nb-mood-note" placeholder="מה השפיע על מצב הרוח שלך היום?" rows="3"></textarea>';

    const sel = window.getSelection();
    if (sel && sel.rangeCount && editor.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(block);
      const space = document.createTextNode(' ');
      block.after(space);
      const r2 = document.createRange();
      r2.setStartAfter(space);
      r2.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r2);
    } else {
      editor.appendChild(block);
      editor.appendChild(document.createTextNode(' '));
    }
    save();
  }

  function showExportDialog(currentTopic, editor, format) {
    const fmtLabel = format === 'pdf' ? 'PDF' : 'Word (.doc)';
    let choice = 'current';

    const rootTopics = getChildren(null);
    const others = rootTopics.filter(t => t.id !== currentTopic.id);

    function makeOpt(value, labelText) {
      const wrap = document.createElement('label');
      wrap.className = 'export-opt' + (value === 'current' ? ' selected' : '');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'export-choice';
      radio.value = value;
      radio.checked = value === 'current';
      radio.addEventListener('change', () => {
        choice = value;
        otherSel.style.display = value === 'other' ? 'block' : 'none';
        overlay.querySelectorAll('.export-opt').forEach(el =>
          el.classList.toggle('selected', el.querySelector('input').value === choice)
        );
      });
      wrap.appendChild(radio);
      wrap.appendChild(document.createTextNode(labelText));
      return wrap;
    }

    const otherSel = App.el('select', {
      class: 'input',
      style: { display: 'none', marginTop: '8px', width: '100%' }
    }, others.length
      ? others.map(t => App.el('option', { value: t.id }, t.name))
      : [App.el('option', { value: '' }, '(אין מחברות אחרות)')]
    );

    const overlay = App.el('div', { class: 'export-overlay', onClick: (e) => {
      if (e.target === overlay) overlay.remove();
    }});

    const optsChildren = [
      makeOpt('current', `המחברת הנוכחית — "${currentTopic.name}"`)
    ];
    if (others.length) {
      optsChildren.push(makeOpt('other', 'מחברת אחרת מהרשימה'));
      optsChildren.push(otherSel);
    }
    optsChildren.push(makeOpt('all', 'כל המחברות לפי סדר הופעתן'));

    const modal = App.el('div', { class: 'export-modal' }, [
      App.el('div', { class: 'export-modal-title' }, `יצוא ל-${fmtLabel}`),
      App.el('div', { class: 'export-opts-wrap' }, optsChildren),
      App.el('div', { class: 'export-modal-footer' }, [
        App.el('button', { class: 'btn-ghost', style: { padding: '10px 18px', borderRadius: 'var(--r-sm)', cursor: 'pointer' }, onClick: () => overlay.remove() }, 'ביטול'),
        App.el('button', { class: 'btn', onClick: () => {
          overlay.remove();
          if (choice === 'current') {
            exportDoc(currentTopic, editor, format);
          } else if (choice === 'other') {
            const id = otherSel.value;
            if (id) exportTopicById(id, format);  // already async-safe
          } else {
            exportAllTopics(format);
          }
        }}, `יצוא ל-${fmtLabel}`)
      ])
    ]);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  async function exportTopicById(id, format) {
    const t = getById(id);
    if (!t) return;
    function collectHtml(topicId) {
      const topic = getById(topicId);
      if (!topic) return '';
      let html = topic.body || '';
      getChildren(topicId).forEach(c => {
        html += `<h2 style="margin-top:24px">${c.name}</h2>` + collectHtml(c.id);
      });
      return html;
    }
    const div = document.createElement('div');
    div.innerHTML = collectHtml(id);
    await exportDoc(t, div, format);
  }

  async function exportAllTopics(format) {
    const roots = getChildren(null);
    let html = '';
    function addTopic(topicId, depth) {
      const t = getById(topicId);
      if (!t) return;
      const tag = depth === 0 ? 'h1' : depth === 1 ? 'h2' : 'h3';
      html += `<${tag}>${t.name}</${tag}>` + (t.body || '');
      getChildren(topicId).forEach(c => addTopic(c.id, depth + 1));
    }
    roots.forEach(t => addTopic(t.id, 0));
    const div = document.createElement('div');
    div.innerHTML = html;
    await exportDoc({ name: 'כל המחברות', updatedAt: Date.now() }, div, format);
  }

  // Convert any img to a data-URL via canvas (handles external URLs + ensures inline)
  function imgToDataUrl(img) {
    return new Promise(resolve => {
      if (!img.src || img.src.startsWith('data:')) { resolve(img.src); return; }
      const tmp = new Image();
      tmp.crossOrigin = 'anonymous';
      tmp.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = tmp.naturalWidth; c.height = tmp.naturalHeight;
          c.getContext('2d').drawImage(tmp, 0, 0);
          resolve(c.toDataURL('image/jpeg', 0.85));
        } catch { resolve(img.src); }
      };
      tmp.onerror = () => resolve(img.src);
      tmp.src = img.src;
    });
  }

  async function exportDoc(topic, editor, format) {
    const title = topic.name || 'מחברת';

    // ── Step 0: ensure all images are inline data-URLs (not external URLs)
    await Promise.all(Array.from(editor.querySelectorAll('figure.nb-img img')).map(async img => {
      if (img.src && !img.src.startsWith('data:')) {
        img.src = await imgToDataUrl(img);
      }
    }));

    // ── Step 1: stamp each figure's rendered pixel-width onto data-ew
    const MAX_IMG_W = 480;
    editor.querySelectorAll('figure.nb-img').forEach(fig => {
      const liveW = fig.getBoundingClientRect().width;
      const styleW = parseInt(fig.style.width) || 0;
      const w = liveW > 0 ? liveW : styleW > 0 ? styleW : 300;
      fig.dataset.ew = String(Math.round(Math.min(w, MAX_IMG_W)));
    });

    const cloned = editor.cloneNode(true);

    // Clean up data-ew from the live editor
    editor.querySelectorAll('figure.nb-img').forEach(fig => { delete fig.dataset.ew; });

    // ── Step 2: fix mood-embed textarea values in clone
    cloned.querySelectorAll('.nb-mood-embed').forEach(block => {
      const level = block.dataset.level || '';
      block.querySelectorAll('.nb-mood-btn').forEach(b =>
        b.classList.toggle('selected', b.dataset.level === level)
      );
      const ta = block.querySelector('.nb-mood-note');
      if (ta) {
        const noteText = block.dataset.note || '';
        ta.textContent = noteText;
        ta.setAttribute('value', noteText);
      }
    });

    // ── Step 3: replace every figure with a Word-safe <table> wrapper
    //
    //  CRITICAL: MUST use el.setAttribute('style', ...) — NOT el.style.cssText.
    //  el.style.cssText goes through the browser's CSS parser which silently
    //  strips non-standard properties like mso-pagination, mso-break-type etc.
    //  setAttribute stores the raw string; innerHTML serialisation preserves it
    //  so Word sees the MSO directives it needs.
    cloned.querySelectorAll('figure.nb-img').forEach(fig => {
      const img = fig.querySelector('img');
      if (!img) return;
      const w = parseInt(fig.dataset.ew) || 300;
      const clonedImg = img.cloneNode(true);
      clonedImg.setAttribute('width', w);
      clonedImg.setAttribute('height', 'auto');
      // setAttribute — preserves all properties in the serialised HTML
      clonedImg.setAttribute('style', `width:${w}px;height:auto;display:block;margin:0 auto;`);

      // <table> is the only element Word reliably keeps on one page.
      // mso-pagination:widow-orphan keep-together = Word's native "keep together" flag.
      const tbl = document.createElement('table');
      tbl.setAttribute('border', '0');
      tbl.setAttribute('cellpadding', '0');
      tbl.setAttribute('cellspacing', '0');
      tbl.setAttribute('align', 'center');
      tbl.setAttribute('width', '100%');
      tbl.setAttribute('style',          // setAttribute = MSO props survive serialisation
        'page-break-inside:avoid;break-inside:avoid;' +
        'mso-pagination:widow-orphan keep-together;' +
        'border-collapse:collapse;margin:8px 0;');
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.setAttribute('align', 'center');
      td.setAttribute('style', 'padding:8px 0;text-align:center;');
      td.appendChild(clonedImg);
      tr.appendChild(td);
      tbl.appendChild(tr);
      fig.replaceWith(tbl);
    });

    // ── Step 4: handle page-spacers and remove UI-only elements
    //
    //  CRITICAL WORD QUIRK: Word only respects page-break-after:always on a <p>
    //  when that <p> is a direct child of <body> (i.e. at the top level of the
    //  content).  If the <p> is nested inside a <div>, Word silently ignores it.
    //
    //  Contenteditable wraps everything in <div> elements (one per line), so
    //  the spacer and its adjacent table both live inside such a <div>.
    //  We must walk up the DOM from the spacer until we find the ancestor that
    //  is a direct child of `cloned` (= the editor root that becomes <body>),
    //  then insert the page-break <p> BEFORE that ancestor — not inside it.
    //
    //  → valid spacer (nextSibling is TABLE)  → lift page-break to top level
    //  → stale spacer (no adjacent TABLE)     → just remove (avoid blank pages)
    cloned.querySelectorAll('.nb-page-spacer').forEach(spacer => {
      const next = spacer.nextElementSibling;

      if (next && next.tagName === 'TABLE') {
        // Build the hard page-break paragraph
        const pb = document.createElement('p');
        pb.setAttribute('style',
          'margin:0;padding:0;line-height:0;font-size:1px;' +
          'page-break-after:always;break-after:page;mso-break-type:page-break;');
        const br = document.createElement('br');
        br.setAttribute('style', 'mso-special-character:line-break;page-break-before:always');
        pb.appendChild(br);

        // Walk up to find the direct child of cloned so we can insert pb at the top level
        let anchor = spacer;
        while (anchor.parentElement && anchor.parentElement !== cloned) {
          anchor = anchor.parentElement;
        }
        // Insert page-break paragraph BEFORE the outermost wrapper div
        (anchor.parentElement || spacer.parentElement).insertBefore(pb, anchor);
        spacer.remove();
      } else {
        spacer.remove(); // stale spacer — would create a blank page if kept
      }
    });
    cloned.querySelectorAll('.nb-img-del').forEach(el => el.remove());

    // ── Step 5: Flatten for Word ─────────────────────────────────────────────
    // contenteditable produces one <div> per line.
    // Rules (applied only to direct children of the editor root):
    //   A) div wrapping an image table → lift table out, convert remainder to <p>
    //   B) empty div (just whitespace/br) → collapse (keep at most 1 per run)
    //   C) plain text div with no block children → convert to <p>
    //   SKIP: divs with class names (nb-mood-embed, etc.) — leave untouched
    //   SKIP: divs that contain nested block elements — leave as div
    const BLOCK_TAGS = new Set(['DIV','TABLE','P','H1','H2','H3','UL','OL','LI','BLOCKQUOTE','FIGURE']);
    const kids = Array.from(cloned.children);
    let blankRun = 0;

    for (const child of kids) {
      if (child.tagName !== 'DIV') { blankRun = 0; continue; }

      // SKIP: divs with a class (mood-embed, etc.) — don't touch them
      if (child.className && child.className.trim()) { blankRun = 0; continue; }

      // A) first child element is our image table → lift it out
      const firstEl = child.firstElementChild;
      if (firstEl && firstEl.tagName === 'TABLE') {
        child.before(firstEl);            // move table before this div
        if (!child.textContent.trim()) {
          child.remove();                 // shell is empty — drop it
        } else {
          // Remaining text after the table → convert shell to <p>
          const p = document.createElement('p');
          p.setAttribute('dir', 'rtl');
          p.setAttribute('style', 'margin:3px 0;');
          while (child.firstChild) p.appendChild(child.firstChild);
          child.replaceWith(p);
        }
        blankRun = 0;
        continue;
      }

      // B) empty div → collapse consecutive blank lines (max 1 kept)
      if (!child.textContent.trim()) {
        blankRun++;
        if (blankRun > 1) { child.remove(); continue; }
        const ep = document.createElement('p');
        ep.setAttribute('style', 'margin:0;line-height:1;');
        child.replaceWith(ep);
        continue;
      }

      // C) div with text but no nested block elements → safe to convert to <p>
      blankRun = 0;
      const hasBlock = Array.from(child.children).some(c => BLOCK_TAGS.has(c.tagName));
      if (!hasBlock) {
        const p = document.createElement('p');
        p.setAttribute('dir', 'rtl');
        const cs = child.getAttribute('style') || '';
        p.setAttribute('style', cs + (cs ? ';' : '') + 'margin:3px 0;');
        while (child.firstChild) p.appendChild(child.firstChild);
        child.replaceWith(p);
      }
      // div with block children → leave as-is (Word handles it)
    }

    const body = cloned.innerHTML;

    const baseStyles = `
      body{font-family:Arial,sans-serif;font-size:11pt;direction:rtl;padding:40px;max-width:820px;margin:0 auto;color:#3b3a3a;}
      h1{font-size:28px;margin-bottom:24px;}
      table[align="center"]{border-collapse:collapse;page-break-inside:avoid;mso-pagination:widow-orphan keep-together;}
      table[align="center"] td{text-align:center;padding:8px 0;}
      .nb-mood-embed{border:2px solid #f0c4cc;border-radius:12px;padding:16px;margin:16px 0;background:#fffaf8;}
      .nb-mood-embed-header{font-weight:600;font-size:12px;color:#888;letter-spacing:.05em;margin-bottom:10px;}
      .nb-mood-embed-row{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:12px;}
      .nb-mood-embed-q{font-size:15px;font-weight:500;}
      .nb-mood-btn{width:36px;height:36px;border-radius:50%;background:#f5f0ea;font-size:20px;border:1px solid #ddd;cursor:default;}
      .nb-mood-btn.selected{background:#fadadd;border-color:#e5a8b0;box-shadow:0 2px 6px rgba(0,0,0,.12);}
      .nb-mood-note{width:100%;border:1px solid #ddd;border-radius:8px;padding:8px 12px;font-family:Arial,sans-serif;resize:none;box-sizing:border-box;min-height:60px;}`;

    // ── PDF export ────────────────────────────────────────────────────────────
    // Strategy: inject a hidden print-only layer into the current page.
    // @media print CSS hides everything except this layer, so window.print()
    // shows ONLY the notebook content. The user clicks "Save as PDF" (one click
    // in Chrome/Edge since Save-as-PDF is the default destination on most systems).
    // This is the only approach that reliably handles Hebrew RTL + images.
    if (format === 'pdf') {
      // 1. Build the print content element
      const printId = 'nb-pdf-content-' + Date.now();
      const printDiv = document.createElement('div');
      printDiv.id = printId;
      printDiv.setAttribute('dir', 'rtl');
      printDiv.setAttribute('style', 'font-size:11pt;font-family:Arial,sans-serif;display:none;');
      printDiv.innerHTML = `<h1 style="font-size:24pt;margin-bottom:18pt;font-family:Arial,sans-serif;">${title}</h1>${body}`;

      // 2. Print-only stylesheet: hide everything else, show only our div
      const printStyle = document.createElement('style');
      printStyle.id = printId + '-style';
      printStyle.textContent = `
        @media print {
          body > *:not(#${printId}) { display: none !important; visibility: hidden !important; }
          #${printId} {
            display: block !important;
            visibility: visible !important;
            position: static !important;
            font-family: Arial, sans-serif;
            font-size: 11pt;
            color: #000;
            direction: rtl;
            line-height: 1.7;
          }
          #${printId} h1,#${printId} h2,#${printId} h3 { margin-bottom: 8pt; }
          #${printId} p { margin: 6pt 0; }
          #${printId} p[align="center"] { text-align: center; }
          #${printId} img { max-width: 100%; height: auto; }
          #${printId} .nb-mood-embed { border: 1pt solid #f0c4cc; border-radius: 6pt; padding: 10pt; margin: 10pt 0; background: #fffaf8; }
          #${printId} .nb-mood-btn { width: 28pt; height: 28pt; border-radius: 50%; font-size: 16pt; display: inline-flex; align-items: center; justify-content: center; }
          #${printId} .nb-mood-btn.selected { background: #fadadd; border: 1pt solid #e5a8b0; }
          #${printId} .nb-mood-note { border: 1pt solid #ddd; border-radius: 5pt; padding: 6pt; width: 100%; min-height: 40pt; font-family: Arial; }
          #${printId} .nb-page-spacer { page-break-after: always; break-after: page; height: 0; overflow: hidden; }
          #${printId} .nb-img-del { display: none !important; }
          #${printId} figure.nb-img, #${printId} p[align="center"] { page-break-inside: avoid; break-inside: avoid; }
          @page { margin: 15mm; size: A4; }
        }`;

      document.head.appendChild(printStyle);
      document.body.appendChild(printDiv);

      // 3. Show instruction modal BEFORE opening print dialog
      const modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;align-items:center;justify-content:center;';
      modal.innerHTML = `
        <div style="background:#fff;border-radius:18px;padding:32px 36px;max-width:420px;width:90%;direction:rtl;font-family:Arial,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.3);">
          <div style="font-size:36px;text-align:center;margin-bottom:12px;">📄</div>
          <h2 style="margin:0 0 16px;font-size:20px;text-align:center;color:#3b3a3a;">ייצוא ל-PDF</h2>
          <p style="margin:0 0 14px;color:#555;font-size:14px;line-height:1.6;">בחלון ההדפסה שייפתח, עשה את הצעדים הבאים:</p>
          <ol style="margin:0 0 20px;padding-right:20px;color:#333;font-size:14px;line-height:2;">
            <li>לחץ על <strong>"יעד"</strong> (Destination)</li>
            <li>בחר <strong>"שמור כ-PDF"</strong> או <strong>"Microsoft Print to PDF"</strong></li>
            <li>לחץ <strong>"שמור"</strong></li>
          </ol>
          <div style="background:#f0f7ff;border-radius:10px;padding:10px 14px;margin-bottom:20px;font-size:13px;color:#444;display:flex;gap:10px;align-items:center;">
            <span style="font-size:20px;">💡</span>
            <span>בכרום ובאדג׳ ניתן גם ללחוץ <strong>Ctrl+Shift+P</strong> ישירות מהאתר</span>
          </div>
          <button id="nb-pdf-go" style="width:100%;padding:13px;background:linear-gradient(135deg,#FADADD,#E6DDF4);border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;font-family:Arial;color:#3b3a3a;">
            הבנתי — פתח חלון הדפסה ▶
          </button>
        </div>`;
      document.body.appendChild(modal);

      document.getElementById('nb-pdf-go').addEventListener('click', () => {
        modal.remove();
        setTimeout(() => {
          window.print();
          setTimeout(() => { printStyle.remove(); printDiv.remove(); }, 1500);
        }, 150);
      });

      // Also close modal on backdrop click
      modal.addEventListener('click', e => {
        if (e.target === modal) modal.remove();
      });
      return;
    }

    // ── Word export ───────────────────────────────────────────────────────────
    if (format === 'word') {
      const html = [
        `<html xmlns:o='urn:schemas-microsoft-com:office:office'`,
        ` xmlns:w='urn:schemas-microsoft-com:office:word'`,
        ` xmlns='http://www.w3.org/TR/REC-html40'>`,
        `<head><meta charset='utf-8'><title>${title}</title>`,
        `<style>${baseStyles}</style></head>`,
        `<body dir="rtl" style="font-size:11pt;font-family:Arial,sans-serif;"><h1>${title}</h1>${body}</body></html>`
      ].join('');
      const blob = new Blob(['﻿', html], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = title + '.doc'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      App.toast('✓ קובץ Word הורד');
    }
  }

  function updateTopic(id, patch) {
    const list = getTopics().map(t => t.id === id ? { ...t, ...patch } : t);
    Store.set('topics', list);
  }

  function rerender() {
    const view = document.getElementById('view');
    view.innerHTML = '';
    render(view);
  }

  App.register('notebook', render);
})();
