(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // חיפוש מהיר (לוח פקודות) — אחריות עצמאית (window.Palette).
  // Ctrl/Cmd+K מכל מקום (כולל בתוך העורך — הוא לא מיירט K), או '/' מחוץ
  // לשדות קלט. ממזג שלושה מקורות, כולם קריאה בלבד:
  //   • ניווט — window.App.sections (הרשימה החיה, בלי שכפול)
  //   • תוכן אישי — window.AsstEngine.searchContent (מנוע הבוט הקיים)
  //   • פעולות מהירות — משימה/הערה חדשה, החלפת ערכת נושא
  // מקלדת מלאה: חצים, Enter, Esc. אם מודול חסר — מדלגים עליו בשקט.
  // ─────────────────────────────────────────────────────────────────────────

  function el(tag, attrs, kids) { return App.el(tag, attrs || {}, kids || []); }

  let _overlay = null, _input = null, _list = null;
  let _items = [];       // הפריטים המוצגים כרגע
  let _sel = 0;
  let _debT = null;

  // ── מקורות ────────────────────────────────────────────────────────────────
  function navItems(q) {
    const sections = (window.App && App.sections) || [];
    const qq = q.trim();
    return sections
      .filter(s => !qq || (s.title + ' ' + (s.desc || '')).includes(qq))
      .map(s => ({
        icon: s.icon, title: s.title, sub: s.desc || 'מעבר למסך', group: 'ניווט',
        run: () => { location.hash = '#/' + s.id; }
      }));
  }

  function actionItems(q) {
    const acts = [
      {
        icon: '➕', title: 'משימה חדשה', sub: 'פתח משימות והתמקד בשורת ההוספה', keys: 'משימה חדשה להוסיף',
        run: () => {
          location.hash = '#/todos';
          setTimeout(() => { const i = document.querySelector('#view input[placeholder^="הוסף משימה"]'); if (i) i.focus(); }, 250);
        }
      },
      {
        icon: '📝', title: 'הערה חדשה', sub: 'צור הערה חדשה בהערות', keys: 'הערה חדשה פתק',
        run: () => {
          location.hash = '#/notes';
          setTimeout(() => { const b = [...document.querySelectorAll('#view button')].find(x => x.textContent.includes('חדש')); if (b) b.click(); }, 250);
        }
      },
      {
        icon: '🌙', title: 'החלף ערכת נושא', sub: 'מעבר בין בהיר לכהה', keys: 'ערכה כהה בהיר תצוגה',
        run: () => { if (window.Theme) Theme.set(Theme.resolved() === 'dark' ? 'cream' : 'dark'); }
      }
    ];
    const qq = q.trim();
    return acts
      .filter(a => !qq || (a.title + ' ' + a.keys).includes(qq))
      .map(a => ({ icon: a.icon, title: a.title, sub: a.sub, group: 'פעולות', run: a.run }));
  }

  function contentItems(q) {
    if (!q.trim() || !(window.AsstEngine && AsstEngine.searchContent)) return [];
    let res = [];
    try { res = AsstEngine.searchContent(q, 6) || []; } catch (e) {}
    return res.map(r => ({
      icon: r.icon || '🔎', title: r.title, sub: r.sub || 'מהתוכן שלך', group: 'התוכן שלך',
      run: () => {
        if (r.open && r.open.k) { try { sessionStorage.setItem(r.open.k, r.open.id); } catch (e) {} }
        if (r.route) location.hash = r.route;
      }
    }));
  }

  function collect(q) {
    const nav = navItems(q), acts = actionItems(q), content = contentItems(q);
    // בלי שאילתה: ניווט ופעולות בלבד; עם שאילתה: התוכן קודם
    return q.trim() ? content.concat(nav, acts) : nav.concat(acts);
  }

  // ── רינדור ────────────────────────────────────────────────────────────────
  function renderList(q) {
    _items = collect(q);
    _sel = 0;
    _list.innerHTML = '';
    if (!_items.length) {
      _list.appendChild(el('div', { class: 'plt-none' }, 'אין תוצאות — נסה ניסוח אחר'));
      return;
    }
    let lastGroup = null;
    _items.forEach((it, i) => {
      if (it.group !== lastGroup) {
        lastGroup = it.group;
        _list.appendChild(el('div', { class: 'plt-group' }, it.group));
      }
      const row = el('button', {
        class: 'plt-item' + (i === _sel ? ' sel' : ''),
        'data-i': i,
        onClick: () => activate(i),
        onMouseenter: () => select(i)
      }, [
        el('span', { class: 'plt-icon' }, it.icon),
        el('span', { class: 'plt-body' }, [
          el('span', { class: 'plt-title' }, it.title),
          it.sub ? el('span', { class: 'plt-sub' }, it.sub) : null
        ])
      ]);
      _list.appendChild(row);
    });
  }

  function select(i) {
    if (i < 0) i = _items.length - 1;
    if (i >= _items.length) i = 0;
    _sel = i;
    _list.querySelectorAll('.plt-item').forEach(b => b.classList.toggle('sel', +b.dataset.i === i));
    const selEl = _list.querySelector('.plt-item.sel');
    if (selEl && selEl.scrollIntoView) selEl.scrollIntoView({ block: 'nearest' });
  }

  function activate(i) {
    const it = _items[i];
    close();
    if (it && it.run) { try { it.run(); } catch (e) { console.warn('palette action failed:', e); } }
  }

  // ── פתיחה/סגירה ──────────────────────────────────────────────────────────
  function build() {
    _input = el('input', {
      class: 'plt-input', type: 'text', placeholder: 'חפש מסך, תוכן או פעולה…',
      onInput: () => {
        clearTimeout(_debT);
        _debT = setTimeout(() => renderList(_input.value), 120);
      },
      onKeydown: (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); select(_sel + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); select(_sel - 1); }
        else if (e.key === 'Enter') { e.preventDefault(); activate(_sel); }
      }
    });
    _list = el('div', { class: 'plt-list' });
    const box = el('div', { class: 'plt-box', onClick: (e) => e.stopPropagation() }, [
      el('div', { class: 'plt-inputbar' }, [el('span', { class: 'plt-k' }, 'Ctrl+K'), _input]),
      _list,
      el('div', { class: 'plt-hint' }, '↑↓ ניווט · Enter בחירה · Esc סגירה')
    ]);
    _overlay = el('div', { class: 'plt-overlay', onClick: close }, box);
    document.body.appendChild(_overlay);
  }

  function open() {
    if (!_overlay) build();
    _overlay.style.display = 'flex';
    _input.value = '';
    renderList('');
    setTimeout(() => _input.focus(), 30);
  }
  function close() {
    if (_overlay) _overlay.style.display = 'none';
  }
  function isOpen() { return !!(_overlay && _overlay.style.display !== 'none'); }
  function toggle() { if (isOpen()) close(); else open(); }

  // ── קיצורים גלובליים ──────────────────────────────────────────────────────
  function inEditable(t) {
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      toggle();
      return;
    }
    if (isOpen() && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();   // לא להפעיל יציאה ממצב מיקוד של המחברת
      close();
      return;
    }
    // '/' פותח רק מחוץ לשדות קלט (גיבוי לדפדפנים ששומרים את Ctrl+K לעצמם)
    if (e.key === '/' && !isOpen() && !inEditable(e.target) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      open();
    }
  }, true);

  window.Palette = { open: open, close: close, toggle: toggle };
})();
