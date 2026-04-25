(function () {
  const DAYS = ['א','ב','ג','ד','ה','ו','ש'];
  let selectedDay = null;

  function render(root) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayKey = Store.todayKey();
    const tasks = Store.get('tasks') || [];

    const cells = [];
    for (let i = 0; i < first.getDay(); i++) cells.push(App.el('div', { class: 'cal-cell empty' }));
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const key = Store.dateKey(date);
      const dayTasks = tasks.filter(t => t.date === key);
      const cell = App.el('div', {
        class: 'cal-cell' + (key === todayKey ? ' today' : '') + (key === selectedDay ? ' active' : ''),
        style: key === selectedDay ? { boxShadow: '0 0 0 2px var(--lavender-deep)' } : {},
        onClick: () => {
          selectedDay = key;
          rerender();
        }
      }, [
        App.el('div', { class: 'day-num' }, String(d)),
        App.el('div', { class: 'dots' }, dayTasks.slice(0, 5).map(() => App.el('div', { class: 'dot-m' })))
      ]);
      cells.push(cell);
    }

    root.append(
      App.el('div', { class: 'card' }, [
        App.el('div', { class: 'row row-between' }, [
          App.el('h2', {}, now.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })),
          App.el('span', { class: 'chip sky' }, 'לחץ על יום לעריכה')
        ]),
        App.el('div', { class: 'cal-grid', style: { marginTop: '16px' } }, [
          ...DAYS.map(d => App.el('div', { class: 'cal-head' }, d)),
          ...cells
        ]),
        selectedDay ? renderDayDetail(selectedDay) : null
      ])
    );
  }

  function renderDayDetail(key) {
    const allTasks = Store.get('tasks') || [];
    const dayTasks = allTasks.filter(t => t.date === key);
    const dateLabel = new Date(key + 'T00:00:00').toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });

    const addInput = App.el('input', { class: 'input', placeholder: 'משימה ליום הזה…' });
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && addInput.value.trim()) {
        const list = Store.get('tasks') || [];
        list.push({ id: Store.uid(), text: addInput.value.trim(), date: key, done: false });
        Store.set('tasks', list);
        addInput.value = '';
        rerender();
      }
    });

    const list = App.el('div', { class: 'list' },
      dayTasks.length ? dayTasks.map(t => taskRow(t)) : [App.el('div', { class: 'empty-state' }, 'אין משימות ליום הזה')]
    );

    return App.el('div', { class: 'day-detail' }, [
      App.el('div', { class: 'row row-between' }, [
        App.el('h3', {}, dateLabel),
        App.el('button', {
          class: 'btn-icon',
          title: 'סגור',
          onClick: () => { selectedDay = null; rerender(); }
        }, '✕')
      ]),
      App.el('div', { class: 'row', style: { marginTop: '12px' } }, [addInput]),
      App.el('div', { style: { marginTop: '12px' } }, list)
    ]);
  }

  function taskRow(t) {
    const textEl = App.el('div', {
      class: 'text editable-text',
      contenteditable: 'true',
      onBlur: (e) => {
        const v = e.target.textContent.trim();
        if (v && v !== t.text) {
          Store.set('tasks', (Store.get('tasks') || []).map(x => x.id === t.id ? { ...x, text: v } : x));
        } else if (!v) {
          e.target.textContent = t.text;
        }
      },
      onKeydown: (e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
        if (e.key === 'Escape') { e.target.textContent = t.text; e.target.blur(); }
      }
    }, t.text);

    return App.el('div', { class: 'list-item' + (t.done ? ' done' : '') }, [
      App.el('div', {
        class: 'checkbox' + (t.done ? ' checked' : ''),
        onClick: () => {
          Store.set('tasks', (Store.get('tasks') || []).map(x => x.id === t.id ? { ...x, done: !x.done } : x));
          rerender();
        }
      }),
      textEl,
      App.el('button', {
        class: 'btn-icon del',
        onClick: () => {
          Store.set('tasks', (Store.get('tasks') || []).filter(x => x.id !== t.id));
          rerender();
        }
      }, '✕')
    ]);
  }

  function rerender() { App.render(); }

  App.register('monthly', render);
})();
