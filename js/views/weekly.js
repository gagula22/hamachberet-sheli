(function () {
  const DAY_NAMES = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];

  function weekDates() {
    const d = new Date();
    const sun = new Date(d);
    sun.setDate(d.getDate() - d.getDay());
    return Array.from({length: 7}, (_, i) => {
      const x = new Date(sun);
      x.setDate(sun.getDate() + i);
      return x;
    });
  }

  function render(root) {
    const dates = weekDates();
    const todayKey = Store.todayKey();
    const tasks = Store.get('tasks') || [];

    const columns = dates.map(d => {
      const key = Store.dateKey(d);
      const col = App.el('div', {
        class: 'day-col' + (key === todayKey ? ' today' : ''),
        'data-day': key
      }, [
        App.el('h4', {}, DAY_NAMES[d.getDay()]),
        App.el('div', { class: 'date-n' }, String(d.getDate())),
        ...tasks.filter(t => t.date === key).map(t => taskPill(t)),
        App.el('button', {
          class: 'btn-ghost btn-sm',
          style: { marginTop: 'auto', borderRadius: '8px', padding: '6px', fontSize: '12px', color: 'var(--ink-mute)' },
          onClick: () => {
            const text = prompt('משימה ליום ' + DAY_NAMES[d.getDay()] + ':');
            if (!text) return;
            const list = Store.get('tasks') || [];
            list.push({ id: Store.uid(), text, date: key, done: false });
            Store.set('tasks', list);
            App.render();
          }
        }, '+ משימה')
      ]);

      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drag-over'); });
      col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('drag-over');
        const id = e.dataTransfer.getData('text/plain');
        const list = (Store.get('tasks') || []).map(t => t.id === id ? { ...t, date: key } : t);
        Store.set('tasks', list);
        App.render();
      });

      return col;
    });

    root.append(
      App.el('div', { class: 'stack stack-lg' }, [
        App.el('div', { class: 'card' }, [
          App.el('div', { class: 'row row-between' }, [
            App.el('h2', {}, 'השבוע שלי'),
            App.el('span', { class: 'chip sage' }, 'אפשר לגרור משימות בין הימים')
          ]),
          App.el('div', { class: 'week-grid', style: { marginTop: '16px' } }, columns)
        ])
      ])
    );
  }

  function taskPill(t) {
    const textSpan = App.el('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' } }, t.text);
    const delBtn = App.el('span', {
      class: 'pill-del',
      title: 'מחיקה',
      onClick: (e) => {
        e.stopPropagation();
        Store.set('tasks', (Store.get('tasks') || []).filter(x => x.id !== t.id));
        rerender();
      }
    }, '✕');

    const el = App.el('div', {
      class: 'task-pill',
      draggable: 'true',
      title: 'לחיצה: סימון כבוצע · לחיצה כפולה: עריכה',
      style: { display: 'flex', alignItems: 'center', gap: '4px' },
      onClick: (e) => {
        if (e.target.classList.contains('pill-del')) return;
        const list = (Store.get('tasks') || []).map(x => x.id === t.id ? { ...x, done: !x.done } : x);
        Store.set('tasks', list);
        rerender();
      },
      onDblclick: (e) => {
        e.stopPropagation();
        const newText = prompt('עריכת המשימה:', t.text);
        if (newText !== null && newText.trim() && newText.trim() !== t.text) {
          const list = (Store.get('tasks') || []).map(x => x.id === t.id ? { ...x, text: newText.trim() } : x);
          Store.set('tasks', list);
          rerender();
        }
      }
    }, [textSpan, delBtn]);

    if (t.done) {
      textSpan.style.textDecoration = 'line-through';
      el.style.opacity = '.6';
    }
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', t.id);
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    return el;
  }

  function rerender() { App.render(); }

  App.register('weekly', render);
})();
