(function () {
  // Media cluster lives in media.js (window.nbMedia).
  var _MED = window.nbMedia;
  var insertImage=_MED.insertImage, restoreMoodBlocks=_MED.restoreMoodBlocks, attachMoodBehaviors=_MED.attachMoodBehaviors,
      insertImageFile=_MED.insertImageFile, attachTableResizers=_MED.attachTableResizers, wrapImagesInEditor=_MED.wrapImagesInEditor,
      startImageResize=_MED.startImageResize, openAttachment=_MED.openAttachment, insertFileAttachment=_MED.insertFileAttachment, _fmtSize=_MED._fmtSize;
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

    // Strip UI-only handles before reading HTML (never saved to disk)
    function getCleanHTML() {
      const clone = editor.cloneNode(true);
      clone.querySelectorAll('.nb-col-resize-handle').forEach(h => h.remove());
      return clone.innerHTML;
    }

    function saveImmediate() {
      updateTopic(topic.id, { body: getCleanHTML(), updatedAt: Date.now() });
      refreshPageLabels();
    }
    const save = Editable.debounce(saveImmediate, 500);

    // ── Undo / Redo stack ───────────────────────────────────────────────────
    const _undoStack = [];
    let _undoPtr    = -1;
    const MAX_UNDO  = 60;

    function pushUndo() {
      const snap = getCleanHTML(); // no handles in snapshots
      if (_undoPtr >= 0 && _undoStack[_undoPtr] === snap) return;
      _undoStack.splice(_undoPtr + 1);
      _undoStack.push(snap);
      if (_undoStack.length > MAX_UNDO) _undoStack.shift();
      else _undoPtr++;
    }

    function restoreSnapshot(snap) {
      editor.innerHTML = snap;
      restoreMoodBlocks(editor);
      Editable.attachImageBehaviors(editor, save);
      attachMoodBehaviors(editor, save);
      attachTableResizers(editor, save); // re-attach after undo/redo
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
    attachTableResizers(editor, save); // uses RAF internally — safe at load time

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
      { label: 'Word (.doc)', icon: '📄', action: () => window.nbExport.showExportDialog(topic, editor, 'word') },
      { label: 'PDF (להדפסה)', icon: '🖨️', action: () => window.nbExport.showExportDialog(topic, editor, 'pdf') }
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
    // ── Table grid picker ────────────────────────────────────────────────
    function showTablePicker(anchorBtn) {
      document.getElementById('_nb_tbl_picker')?.remove();

      const MAX_R = 8, MAX_C = 8;
      let hR = 0, hC = 0;

      const picker = document.createElement('div');
      picker.id = '_nb_tbl_picker';
      picker.style.cssText = [
        'position:fixed',
        'background:#FFFCF5',
        'border:1px solid #D8C9B0',
        'border-radius:10px',
        'padding:10px 12px 12px',
        'box-shadow:0 6px 20px rgba(0,0,0,0.13)',
        'z-index:2000',
        'user-select:none'
      ].join(';');

      const rect = anchorBtn.getBoundingClientRect();
      picker.style.top  = (rect.bottom + 6) + 'px';
      // Align right edge of picker with button center
      picker.style.left = Math.max(8, rect.left - 60) + 'px';

      const label = document.createElement('div');
      label.style.cssText = 'text-align:center;font-size:12px;color:#6B5840;margin-bottom:8px;font-family:Heebo,sans-serif;min-height:18px;';
      label.textContent = 'גרור לבחירת גודל';

      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(8,22px);gap:3px;';

      const cells = [];
      for (let r = 0; r < MAX_R; r++) {
        for (let c = 0; c < MAX_C; c++) {
          const cell = document.createElement('div');
          cell.style.cssText = 'width:22px;height:22px;border:1.5px solid #E5D8C0;border-radius:3px;background:#F4ECD8;cursor:pointer;box-sizing:border-box;';
          cell.dataset.r = r;
          cell.dataset.c = c;
          cells.push(cell);
          grid.appendChild(cell);
        }
      }

      function updateHighlight(r, c) {
        hR = r; hC = c;
        cells.forEach(cell => {
          const cr = +cell.dataset.r, cc = +cell.dataset.c;
          const on = cr <= r && cc <= c;
          cell.style.background     = on ? '#B8762A' : '#F4ECD8';
          cell.style.borderColor    = on ? '#8C4A2C' : '#E5D8C0';
        });
        label.textContent = (r + 1) + ' שורות × ' + (c + 1) + ' עמודות';
      }

      grid.addEventListener('mousemove', e => {
        const t = e.target.closest('[data-r]');
        if (t) updateHighlight(+t.dataset.r, +t.dataset.c);
      });
      grid.addEventListener('mouseleave', () => {
        cells.forEach(c => { c.style.background = '#F4ECD8'; c.style.borderColor = '#E5D8C0'; });
        label.textContent = 'גרור לבחירת גודל';
        hR = 0; hC = 0;
      });
      grid.addEventListener('click', () => {
        picker.remove();
        document.removeEventListener('mousedown', outside);
        doInsertTable(hR + 1, hC + 1);
      });

      picker.appendChild(label);
      picker.appendChild(grid);
      document.body.appendChild(picker);

      function outside(e) {
        if (!picker.contains(e.target) && e.target !== anchorBtn) {
          picker.remove();
          document.removeEventListener('mousedown', outside);
        }
      }
      setTimeout(() => document.addEventListener('mousedown', outside), 0);
    }

    function doInsertTable(rows, cols) {
      const HEB = ['א','ב','ג','ד','ה','ו','ז','ח','ט','י'];
      const pct = Math.floor(100 / cols);  // equal column % widths
      const th  = 'style="border:1px solid #D8C9B0;padding:6px 10px;background:#F4ECD8;font-weight:500;text-align:start;word-break:break-word"';
      const td  = 'style="border:1px solid #D8C9B0;padding:6px 10px;word-break:break-word"';
      // table-layout:fixed + equal <col> widths → always stays within page on export/print
      let html = '<table dir="rtl" style="border-collapse:collapse;width:100%;table-layout:fixed;margin:8px 0"><colgroup>'
               + Array.from({length:cols}, () => `<col style="width:${pct}%">`).join('')
               + '</colgroup><tbody>';
      html += '<tr>' + Array.from({length:cols},(_,i)=>`<th ${th}>עמודה ${HEB[i]||i+1}</th>`).join('') + '</tr>';
      for (let r = 0; r < rows; r++) {
        html += '<tr>' + Array.from({length:cols},()=>`<td ${td}>&nbsp;</td>`).join('') + '</tr>';
      }
      html += '</tbody></table><p dir="rtl"><br></p>';
      editor.focus();
      exec('insertHTML', html);
      attachTableResizers(editor, save); // attach handles to the freshly-inserted table
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
          tbBtn('⊞',   'טבלה',            (e) => showTablePicker(e.currentTarget)),
          tbBtn('⟦⟧',  'קישור פנימי [[ ]]', () => insertWikiLink()),
          tbBtn('—',   'קו מפריד',        () => { exec('insertHorizontalRule'); save(); })
        ),
        grp(
          tbBtn('📄',  'גלריית תבניות', () => window.nbExport.openTemplateGallery(editor, save, topic.id)),
          tbBtn('🎭',  'יומן מצב רוח', () => window.nbExport.openMoodModal(editor, save)),
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

    // ── Tag management with autocomplete dropdown ────────────────────────
    const topicTags = Array.isArray(topic.tags) ? [...topic.tags] : [];
    const tagsRow = App.el('div', { class: 'nb-note-tags' });

    // Persistent input + dropdown (survive pill re-renders)
    const tagSuggest = App.el('div', { class: 'nb-tag-dropdown' });
    const tagInput   = App.el('input', { class: 'nb-tag-input', placeholder: '+ תגית', type: 'text' });
    const tagWrap    = App.el('div',   { class: 'nb-tag-input-wrap' }, [tagInput, tagSuggest]);

    function getAllKnownTags() {
      const counts = {};
      getTopics().forEach(t => (t.tags || []).forEach(tag => {
        counts[tag] = (counts[tag] || 0) + 1;
      }));
      return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([t]) => t);
    }

    function hideSuggest() { tagSuggest.style.display = 'none'; }

    function showSuggest(filter) {
      const lower = (filter || '').toLowerCase();
      const all = getAllKnownTags()
        .filter(t => !lower || t.toLowerCase().includes(lower))
        .slice(0, 12);
      if (!all.length) { hideSuggest(); return; }
      tagSuggest.innerHTML = '';
      all.forEach(tag => {
        const already = topicTags.includes(tag);
        const item = document.createElement('div');
        item.className = 'nb-tag-dd-item' + (already ? ' nb-tag-dd-applied' : '');
        item.setAttribute('tabindex', '-1');
        item.innerHTML = (already ? '<span class="nb-tag-dd-check">✓</span>' : '') + '#' + tag;
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          if (!already) addTag(tag);
        });
        tagSuggest.appendChild(item);
      });
      tagSuggest.style.display = 'block';
    }

    function addTag(tag) {
      const t = tag.trim();
      if (t && !topicTags.includes(t)) {
        topicTags.push(t);
        updateTopic(topic.id, { tags: [...topicTags] });
      }
      tagInput.value = '';
      hideSuggest();
      renderTagPills();
    }

    tagInput.addEventListener('focus', () => showSuggest(tagInput.value.trim()));
    tagInput.addEventListener('input', () => showSuggest(tagInput.value.trim()));
    tagInput.addEventListener('blur',  () => setTimeout(hideSuggest, 160));
    tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = tagInput.value.trim();
        if (val) addTag(val); else hideSuggest();
      } else if (e.key === 'Escape') {
        tagInput.value = '';
        hideSuggest();
        tagInput.blur();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const first = tagSuggest.querySelector('.nb-tag-dd-item');
        if (first) first.focus();
      }
    });
    tagSuggest.addEventListener('keydown', (e) => {
      const items = [...tagSuggest.querySelectorAll('.nb-tag-dd-item')];
      const idx   = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        (items[idx + 1] || tagInput).focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (idx <= 0) tagInput.focus(); else items[idx - 1].focus();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const tag = (document.activeElement.textContent || '').replace(/^#/, '');
        if (tag) { addTag(tag); tagInput.focus(); }
      } else if (e.key === 'Escape') {
        hideSuggest();
        tagInput.focus();
      }
    });

    function renderTagPills() {
      // Remove everything except tagWrap, then re-insert pills before it
      Array.from(tagsRow.children).forEach(ch => { if (ch !== tagWrap) ch.remove(); });
      const dateStr  = new Date(topic.createdAt || Date.now()).toLocaleDateString('he-IL', {
        weekday: 'long', day: 'numeric', month: 'long'
      });
      tagsRow.insertBefore(App.el('span', { class: 'nb-note-tag nb-date-tag' }, dateStr), tagWrap);
      topicTags.forEach((tag, idx) => {
        const pill = App.el('span', { class: 'nb-note-tag' }, [
          document.createTextNode(tag),
          App.el('span', {
            class: 'nb-tag-x',
            onClick: (e) => {
              e.stopPropagation();
              topicTags.splice(idx, 1);
              updateTopic(topic.id, { tags: [...topicTags] });
              renderTagPills();
            }
          }, '×')
        ]);
        tagsRow.insertBefore(pill, tagWrap);
      });
    }

    tagsRow.appendChild(tagWrap);
    renderTagPills();

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


  // ── Template gallery modal (full: tabs, built-in, custom, edit, save-current) ──
  // Tree queries exposed for the export module (notebook/export.js).
  window.nbTree = { getById: getById, getChildren: getChildren, updateTopic: updateTopic };

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