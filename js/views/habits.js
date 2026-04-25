(function () {
  function render(root) {
    const habits = Store.get('habits') || [];
    const weekDays = [];
    const d = new Date();
    const sun = new Date(d); sun.setDate(d.getDate() - d.getDay());
    for (let i = 0; i < 7; i++) { const x = new Date(sun); x.setDate(sun.getDate() + i); weekDays.push(x); }
    const DAY_LETTERS = ['א','ב','ג','ד','ה','ו','ש'];

    const header = App.el('div', {
      class: 'habit-row',
      style: { background: 'transparent', fontSize: '11px', color: 'var(--ink-mute)', letterSpacing: '0.04em' }
    }, [
      App.el('div', {}, 'הרגל'),
      ...DAY_LETTERS.map((l, i) => App.el('div', { style: { textAlign: 'center' } }, `${l} ${weekDays[i].getDate()}`)),
      App.el('div', { style: { textAlign: 'end' } }, 'רצף'),
      App.el('div', {})
    ]);

    const rows = habits.map(h => habitRow(h, weekDays));

    const addInput = App.el('input', { class: 'input', placeholder: 'הרגל חדש…' });
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && addInput.value.trim()) {
        const colors = ['blush','sage','sky','butter','lavender'];
        const list = Store.get('habits') || [];
        list.push({
          id: Store.uid(),
          name: addInput.value.trim(),
          color: colors[list.length % colors.length],
          log: {}
        });
        Store.set('habits', list);
        addInput.value = '';
        document.getElementById('view').innerHTML = '';
        render(document.getElementById('view'));
      }
    });

    root.append(
      App.el('div', { class: 'card' }, [
        App.el('div', { class: 'row row-between' }, [
          App.el('h2', {}, 'מעקב הרגלים'),
          App.el('span', { class: 'chip sage' }, 'השבוע הזה')
        ]),
        App.el('div', { class: 'stack', style: { marginTop: '16px' } }, [header, ...rows]),
        App.el('div', { class: 'row', style: { marginTop: '16px' } }, [addInput])
      ])
    );
  }

  function habitRow(h, weekDays) {
    const streak = calcStreak(h.log);
    const nameEl = App.el('span', {
      class: 'editable-text',
      contenteditable: 'true',
      title: 'לחץ לעריכה',
      onBlur: (e) => {
        const v = e.target.textContent.trim();
        if (v && v !== h.name) {
          const list = (Store.get('habits') || []).map(x => x.id === h.id ? { ...x, name: v } : x);
          Store.set('habits', list);
        } else if (!v) {
          e.target.textContent = h.name;
        }
      },
      onKeydown: (e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
        if (e.key === 'Escape') { e.target.textContent = h.name; e.target.blur(); }
      }
    }, h.name);

    return App.el('div', { class: 'habit-row' }, [
      App.el('div', { class: 'habit-name' }, [
        App.el('span', { class: 'chip ' + h.color, style: { marginInlineEnd: '8px' } }, '●'),
        nameEl
      ]),
      ...weekDays.map(d => {
        const key = Store.dateKey(d);
        const filled = !!h.log[key];
        return App.el('div', {
          class: 'habit-cell' + (filled ? ' filled' : ''),
          onClick: () => {
            const list = Store.get('habits') || [];
            const idx = list.findIndex(x => x.id === h.id);
            if (idx < 0) return;
            list[idx].log[key] = !list[idx].log[key];
            Store.set('habits', list);
            document.getElementById('view').innerHTML = '';
            App._routes.habits(document.getElementById('view'));
          }
        }, filled ? '✓' : '');
      }),
      App.el('div', { class: 'habit-streak' }, `🔥 ${streak}`),
      App.el('button', {
        class: 'btn-icon habit-del',
        title: 'מחיקת הרגל',
        onClick: () => {
          if (!confirm(`למחוק את ההרגל "${h.name}"?`)) return;
          Store.set('habits', (Store.get('habits') || []).filter(x => x.id !== h.id));
          document.getElementById('view').innerHTML = '';
          App._routes.habits(document.getElementById('view'));
        }
      }, '✕')
    ]);
  }

  function calcStreak(log) {
    let streak = 0;
    const d = new Date();
    while (true) {
      if (log[Store.dateKey(d)]) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return streak;
  }

  App.register('habits', render);
})();
