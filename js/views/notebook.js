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
      class: 'btn btn-soft',
      onClick: () => {
        const t = createTopic(null);
        if (t) { activeId = t.id; if (isMobile()) mobilePanel = 'editor'; rerender(); }
      }
    }, '+ נושא חדש');

    const topicsEl = App.el('div', { class: 'nb-topics' },
      topics.length
        ? renderTree(null, 0)
        : [App.el('div', { class: 'empty-state', style: { padding: '24px 8px' } }, 'עדיין אין נושאים')]
    );

    const left = App.el('div', { class: 'stack nb-topics-col' }, [addRootBtn, topicsEl]);

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

    const row = App.el('div', {
      class: 'nb-topic' + (t.id === activeId ? ' active' : ''),
      style: { paddingInlineStart: (10 + depth * 18) + 'px' },
      onClick: (e) => {
        if (e.target.closest('.t-action') || e.target.closest('.t-chevron') || e.target.closest('.t-drag')) return;
        activeId = t.id;
        if (isMobile()) mobilePanel = 'editor';
        rerender();
      }
    }, [
      App.el('span', { class: 't-drag', title: 'גרור לשינוי סדר' }, '⠿'),
      chevron,
      App.el('span', { class: 't-icon' }, t.icon || '📓'),
      App.el('span', {
        class: 't-name',
        title: 'לחיצה כפולה לשינוי שם',
        onDblclick: (e) => {
          e.stopPropagation();
          const newName = prompt('שם הנושא:', t.name);
          if (newName !== null && newName.trim() && newName.trim() !== t.name) {
            updateTopic(t.id, { name: newName.trim() });
            rerender();
          }
        }
      }, t.name),
      App.el('button', {
        class: 't-action',
        title: 'תת-נושא חדש',
        onClick: (e) => {
          e.stopPropagation();
          const child = createTopic(t.id);
          if (child) { activeId = child.id; rerender(); }
        }
      }, '＋'),
      App.el('button', {
        class: 't-action',
        title: 'מחיקה',
        onClick: (e) => {
          e.stopPropagation();
          deleteTopic(t.id);
          rerender();
        }
      }, '✕')
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

    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!draggedId || draggedId === t.id) return;
      if (getDescendantIds(draggedId).slice(1).includes(t.id)) return;
      document.querySelectorAll('.nb-drop-before,.nb-drop-after').forEach(el =>
        el.classList.remove('nb-drop-before', 'nb-drop-after')
      );
      const rect = row.getBoundingClientRect();
      row.classList.add(e.clientY < rect.top + rect.height / 2 ? 'nb-drop-before' : 'nb-drop-after');
    });

    row.addEventListener('dragleave', (e) => {
      if (!row.contains(e.relatedTarget)) {
        row.classList.remove('nb-drop-before', 'nb-drop-after');
      }
    });

    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('nb-drop-before', 'nb-drop-after');
      if (!draggedId || draggedId === t.id) return;
      if (getDescendantIds(draggedId).slice(1).includes(t.id)) return;

      const rect = row.getBoundingClientRect();
      const insertBefore = e.clientY < rect.top + rect.height / 2;

      const topics = getTopics();
      const draggedTopic = topics.find(x => x.id === draggedId);
      if (!draggedTopic) return;

      const newParentId = t.parentId || null;
      draggedTopic.parentId = newParentId;

      // Reorder ONLY within the target sibling group — leave other groups untouched
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
    const titleInput = App.el('input', {
      class: 'nb-title',
      placeholder: 'כותרת הנושא…',
      value: topic.name || '',
      onInput: Editable.debounce((e) => updateTopic(topic.id, { name: e.target.value }), 300),
      onBlur: () => rerender()
    });

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

    editor.addEventListener('input', save);
    Editable.attachImageBehaviors(editor, save);
    attachMoodBehaviors(editor, save);

    // Track current editor module-wide so pagehide can flush even mid-debounce.
    activeEditor = { saveImmediate, editor };

    requestAnimationFrame(refreshPageLabels);
    setTimeout(refreshPageLabels, 400);

    const fileInput = App.el('input', { type: 'file', accept: 'image/*', multiple: '', style: { display: 'none' } });
    fileInput.addEventListener('change', () => {
      Array.from(fileInput.files || []).forEach(f => Editable.insertImageFromFile(f, editor, save));
      fileInput.value = '';
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

    const toolbar = App.el('div', { class: 'nb-toolbar' }, [
      fontSel,
      sizeSel,
      sep(),
      tool('B', 'מודגש', () => exec('bold'), { style: { fontWeight: '700' } }),
      tool('I', 'נטוי', () => exec('italic'), { style: { fontStyle: 'italic' } }),
      tool('U', 'קו תחתון', () => exec('underline'), { style: { textDecoration: 'underline' } }),
      sep(),
      colorInput,
      hilightInput,
      sep(),
      tool('⇥', 'יישור לימין', () => exec('justifyRight')),
      tool('≡', 'יישור למרכז', () => exec('justifyCenter')),
      tool('⇤', 'יישור לשמאל', () => exec('justifyLeft')),
      tool('☰', 'מיושר משני הצדדים', () => exec('justifyFull')),
      sep(),
      tool('H1', 'כותרת גדולה', () => exec('formatBlock', 'H1')),
      tool('H2', 'כותרת', () => exec('formatBlock', 'H2')),
      sep(),
      tool('1.', 'רשימה ממוספרת', () => exec('insertOrderedList')),
      sep(),
      tool('🖼️', 'הוסף תמונה', () => fileInput.click()),
      tool('🎭', 'הוסף יומן מצב רוח', () => insertMoodBlock(editor, save)),
      tool('🧹', 'נקה עיצוב', () => exec('removeFormat')),
      sep(),
      tool('📄', 'יצוא PDF', () => showExportDialog(topic, editor, 'pdf')),
      tool('📝', 'יצוא Word', () => showExportDialog(topic, editor, 'word')),
      fileInput
    ]);

    const breadcrumb = buildBreadcrumb(topic);

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

    const meta = App.el('div', { class: 'row row-between', style: { marginTop: '8px', flexWrap: 'wrap', gap: '8px' } }, [
      App.el('span', { class: 'chip lavender' }, 'עודכן: ' + new Date(topic.updatedAt || Date.now()).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })),
      App.el('span', { class: 'chip sky' }, ctx.rootName ? `מתחיל בעמוד ${startPage} · "${ctx.rootName}"` : `עמוד ${startPage}`),
      syncChip
    ]);

    // Toolbar is position:sticky — no spacer needed (stays in flow)
    return App.el('div', { class: 'nb-editor-col' }, [
      backBtn || null,
      toolbar,
      App.el('div', { class: 'card stack' }, [breadcrumb, titleInput, stage, meta])
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
      body{font-family:Arial,sans-serif;direction:rtl;padding:40px;max-width:820px;margin:0 auto;color:#3b3a3a;}
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
      printDiv.style.display = 'none'; // hidden on screen; shown only via @media print
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
        `<body dir="rtl"><h1>${title}</h1>${body}</body></html>`
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
