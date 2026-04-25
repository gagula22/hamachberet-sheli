(function () {
  const CATS = [
    { id: 'career', label: 'קריירה', color: 'sky' },
    { id: 'health', label: 'בריאות', color: 'sage' },
    { id: 'travel', label: 'טיולים', color: 'butter' },
    { id: 'learn',  label: 'לימוד',   color: 'lavender' },
    { id: 'life',   label: 'חיים',    color: 'blush' }
  ];

  function render(root) {
    const goals = Store.get('goals') || [];

    const input = App.el('input', { class: 'input', placeholder: 'מה תרצה להשיג?' });
    const catSel = App.el('select', { class: 'input', style: { maxWidth: '160px' } },
      CATS.map(c => App.el('option', { value: c.id }, c.label))
    );
    const addBtn = App.el('button', {
      class: 'btn',
      onClick: () => {
        const text = input.value.trim();
        if (!text) return;
        const list = Store.get('goals') || [];
        list.unshift({ id: Store.uid(), text, category: catSel.value, done: false });
        Store.set('goals', list);
        input.value = '';
        document.getElementById('view').innerHTML = '';
        render(document.getElementById('view'));
      }
    }, '+ הוסף');

    const byCategory = CATS.map(c => {
      const items = goals.filter(g => g.category === c.id);
      if (!items.length) return null;
      return App.el('div', { class: 'card' }, [
        App.el('div', { class: 'row row-between' }, [
          App.el('h3', {}, c.label),
          App.el('span', { class: 'chip ' + c.color }, `${items.filter(x => x.done).length}/${items.length}`)
        ]),
        App.el('div', { class: 'stack', style: { marginTop: '12px' } },
          items.map(g => App.el('div', { class: 'goal-row' + (g.done ? ' done' : '') }, [
            App.el('div', {
              class: 'checkbox' + (g.done ? ' checked' : ''),
              onClick: () => {
                const list = (Store.get('goals') || []).map(x => x.id === g.id ? { ...x, done: !x.done } : x);
                Store.set('goals', list);
                document.getElementById('view').innerHTML = '';
                render(document.getElementById('view'));
              }
            }),
            App.el('div', {
              class: 'text editable-text',
              contenteditable: 'true',
              title: 'לחץ לעריכה',
              style: { flex: 1, fontSize: '14px' },
              onBlur: (e) => {
                const v = e.target.textContent.trim();
                if (v && v !== g.text) {
                  Store.set('goals', (Store.get('goals') || []).map(x => x.id === g.id ? { ...x, text: v } : x));
                } else if (!v) {
                  e.target.textContent = g.text;
                }
              },
              onKeydown: (e) => {
                if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
                if (e.key === 'Escape') { e.target.textContent = g.text; e.target.blur(); }
              }
            }, g.text),
            App.el('button', {
              class: 'btn-icon',
              onClick: () => {
                Store.set('goals', (Store.get('goals') || []).filter(x => x.id !== g.id));
                document.getElementById('view').innerHTML = '';
                render(document.getElementById('view'));
              }
            }, '✕')
          ]))
        )
      ]);
    }).filter(Boolean);

    root.append(
      App.el('div', { class: 'stack stack-lg' }, [
        App.el('div', { class: 'card' }, [
          App.el('h2', {}, 'מטרות וחלומות'),
          App.el('div', { class: 'row', style: { marginTop: '12px' } }, [input, catSel, addBtn])
        ]),
        byCategory.length
          ? App.el('div', { class: 'grid grid-2' }, byCategory)
          : App.el('div', { class: 'card' }, App.el('div', { class: 'empty-state' }, 'מה יהפוך את השנה הזאת לשנה מדהימה?'))
      ])
    );
  }

  App.register('goals', render);
})();
