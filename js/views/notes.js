(function () {
  let activeId = null;

  function render(root) {
    const notes = Store.get('notes') || [];
    if (!activeId) {
      const stored = sessionStorage.getItem('openNoteId');
      if (stored && notes.find(n => n.id === stored)) { activeId = stored; sessionStorage.removeItem('openNoteId'); }
      else if (notes[0]) activeId = notes[0].id;
    }

    const searchInput = App.el('input', {
      class: 'input',
      placeholder: 'חיפוש בהערות…',
      onInput: (e) => filterList(e.target.value)
    });

    const listEl = App.el('div', { class: 'note-list' });

    function filterList(q) {
      const ql = (q || '').toLowerCase();
      listEl.innerHTML = '';
      (Store.get('notes') || [])
        .filter(n => !ql || (n.title + ' ' + n.body).toLowerCase().includes(ql))
        .forEach(n => listEl.appendChild(noteCard(n)));
    }

    function noteCard(n) {
      return App.el('div', {
        class: 'note-card' + (n.id === activeId ? ' active' : ''),
        onClick: () => { activeId = n.id; document.getElementById('view').innerHTML = ''; render(document.getElementById('view')); }
      }, [
        App.el('div', { class: 't' }, n.title || 'ללא כותרת'),
        App.el('div', { class: 'p' }, (n.body || '').slice(0, 120) || 'הערה ריקה')
      ]);
    }

    filterList('');

    const leftPane = App.el('div', { class: 'stack' }, [
      App.el('div', { class: 'row' }, [
        searchInput,
        App.el('button', {
          class: 'btn btn-soft',
          onClick: () => {
            const list = Store.get('notes') || [];
            const n = { id: Store.uid(), title: '', body: '', updatedAt: Date.now() };
            list.unshift(n);
            Store.set('notes', list);
            activeId = n.id;
            document.getElementById('view').innerHTML = '';
            render(document.getElementById('view'));
          }
        }, '+ חדש')
      ]),
      listEl
    ]);

    const active = (Store.get('notes') || []).find(n => n.id === activeId);

    const rightPane = active
      ? buildEditor(active)
      : App.el('div', { class: 'card' }, App.el('div', { class: 'empty-state' }, 'בחר הערה או צור חדשה ←'));

    function buildEditor(note) {
      const ed = App.el('div', { class: 'note-body', contenteditable: 'true' });
      ed.innerHTML = note.body || '';

      const save = Editable.debounce(() => {
        updateNote(note.id, { body: ed.innerHTML });
        App.toast('נשמר');
      }, 500);

      ed.addEventListener('input', save);
      Editable.attachImageBehaviors(ed, save);

      const fileInput = App.el('input', {
        type: 'file', accept: 'image/*', multiple: '',
        style: { display: 'none' },
        onChange: (e) => {
          Array.from(e.target.files || []).forEach(f => Editable.insertImageFromFile(f, ed, save));
          e.target.value = '';
        }
      });

      return App.el('div', { class: 'card note-editor' }, [
        App.el('input', {
          class: 'note-title',
          placeholder: 'כותרת…',
          value: note.title || '',
          onInput: Editable.debounce((e) => updateNote(note.id, { title: e.target.value }), 300),
          onBlur: () => { document.getElementById('view').innerHTML = ''; render(document.getElementById('view')); }
        }),
        App.el('div', { class: 'row' }, [
          App.el('span', { class: 'chip lavender' }, new Date(note.updatedAt || Date.now()).toLocaleDateString('he-IL')),
          App.el('button', {
            class: 'btn-ghost btn-sm',
            title: 'הוסף תמונה (אפשר גם להדביק עם Ctrl+V)',
            onClick: () => fileInput.click()
          }, '🖼️ הוסף תמונה'),
          App.el('button', {
            class: 'btn-ghost btn-sm',
            style: { marginInlineStart: 'auto', color: 'var(--ink-mute)' },
            onClick: () => {
              if (!confirm('למחוק את ההערה הזאת?')) return;
              Store.set('notes', (Store.get('notes') || []).filter(n => n.id !== note.id));
              activeId = null;
              document.getElementById('view').innerHTML = '';
              render(document.getElementById('view'));
            }
          }, '🗑 מחק')
        ]),
        App.el('div', { style: { fontSize: '11px', color: 'var(--ink-mute)' } },
          'טיפ: הדבק תמונה (Ctrl+V) · גרור את הפינה לשינוי גודל ↘ · לחץ על תמונה לסיבוב יישור (ימין/מרכז/שמאל)'),
        fileInput,
        ed
      ]);
    }

    root.append(App.el('div', { class: 'notes-layout' }, [leftPane, rightPane]));
  }

  function updateNote(id, patch) {
    const list = (Store.get('notes') || []).map(n => n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n);
    Store.set('notes', list);
  }

  App.register('notes', render);
})();
