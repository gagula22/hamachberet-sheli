(function () {
  function render(root) {
    const input = App.el('input', { class: 'input', placeholder: 'הוסף משימה ולחץ Enter…' });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        const list = Store.get('todos') || [];
        list.unshift({ id: Store.uid(), text: input.value.trim(), done: false });
        Store.set('todos', list);
        input.value = '';
        rerender();
      }
    });

    const listEl = App.el('div', { class: 'list' });

    function rerender() {
      listEl.innerHTML = '';
      const todos = Store.get('todos') || [];
      if (!todos.length) {
        listEl.appendChild(App.el('div', { class: 'empty-state' }, 'אין משימות. תיהנו מהיום 🌸'));
        return;
      }
      todos.forEach(t => {
        const textEl = App.el('div', {
          class: 'text editable-text',
          contenteditable: 'true',
          title: 'לחץ לעריכה',
          onBlur: (e) => {
            const v = e.target.textContent.trim();
            if (v && v !== t.text) {
              Store.set('todos', (Store.get('todos') || []).map(x => x.id === t.id ? { ...x, text: v } : x));
            } else if (!v) {
              e.target.textContent = t.text;
            }
          },
          onKeydown: (e) => {
            if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
            if (e.key === 'Escape') { e.target.textContent = t.text; e.target.blur(); }
          }
        }, t.text);

        const row = App.el('div', { class: 'list-item' + (t.done ? ' done' : '') }, [
          App.el('div', {
            class: 'checkbox' + (t.done ? ' checked' : ''),
            onClick: () => {
              Store.set('todos', (Store.get('todos') || []).map(x => x.id === t.id ? { ...x, done: !x.done } : x));
              rerender();
            }
          }),
          textEl,
          App.el('button', {
            class: 'btn-icon del',
            onClick: () => {
              Store.set('todos', (Store.get('todos') || []).filter(x => x.id !== t.id));
              rerender();
            }
          }, '✕')
        ]);
        listEl.appendChild(row);
      });
    }

    rerender();

    root.append(
      App.el('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '16px' } }, [
        App.el('div', { class: 'card' }, [
          App.el('h2', {}, 'רשימת משימות'),
          App.el('div', { class: 'row', style: { marginBottom: '12px' } }, [input]),
          listEl
        ]),
        App.el('div', { class: 'card' }, [
          App.el('h3', {}, 'טיפים'),
          App.el('ul', { style: { paddingInlineStart: '18px', color: 'var(--ink-soft)', fontSize: '14px', lineHeight: '1.8' } }, [
            App.el('li', {}, 'רשום משימות קטנות ובנות-ביצוע'),
            App.el('li', {}, 'העבר משימות עיקריות לתכנון היומי'),
            App.el('li', {}, 'תחגוג כל ✓')
          ])
        ])
      ])
    );
  }

  App.register('todos', render);
})();
