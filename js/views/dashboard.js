(function () {
  function render(root) {
    const today = Store.todayKey();
    const tasks = Store.get('todos') || [];
    const openTasks = tasks.filter(t => !t.done).length;
    const habits = Store.get('habits') || [];
    const habitsToday = habits.filter(h => h.log[today]).length;
    const mood = Store.get('mood') || {};
    const moodToday = mood[today];
    const notes = Store.get('notes') || [];

    const stats = App.el('div', { class: 'grid grid-4' }, [
      statCard('blush',  openTasks,       'משימות פתוחות',  tasks.length ? `${tasks.length - openTasks} הושלמו` : 'התחל את הרשימה שלך'),
      statCard('sage',   habitsToday + '/' + habits.length, 'הרגלים היום', (habitsToday === habits.length && habits.length) ? 'כל הכבוד! 🌟' : 'להמשיך כך'),
      statCard('sky',    notes.length,    'הערות שנכתבו',   'תפסו עוד רעיונות'),
      statCard('butter', moodEmoji(moodToday), 'מצב הרוח היום', moodToday ? 'נרשם' : 'לחץ כדי לעדכן')
    ]);

    const sectionGrid = App.el('div', { class: 'grid grid-3' },
      App.sections.filter(s => s.id !== 'dashboard').map(s =>
        App.el('div', {
          class: 'section-card',
          onClick: () => { location.hash = `#/${s.id}`; }
        }, [
          App.el('div', { class: 'section-icon', style: { background: `var(--${s.color})` } }, s.icon),
          App.el('div', { class: 'title' }, s.title),
          App.el('div', { class: 'desc' }, s.desc)
        ])
      )
    );

    const recentNotes = notes.slice(0, 3);
    const notesCard = App.el('div', { class: 'card' }, [
      App.el('div', { class: 'row row-between' }, [
        App.el('h2', {}, 'הערות אחרונות'),
        App.el('button', { class: 'btn btn-ghost btn-sm', onClick: () => location.hash = '#/notes' }, 'לכל ההערות ←')
      ]),
      recentNotes.length
        ? App.el('div', { class: 'list' }, recentNotes.map(n =>
            App.el('div', {
              class: 'list-item',
              onClick: () => { sessionStorage.setItem('openNoteId', n.id); location.hash = '#/notes'; }
            }, [
              App.el('span', { style: { fontSize: '18px' } }, '📝'),
              App.el('div', { class: 'text' }, [
                App.el('div', { style: { fontWeight: 500 } }, n.title || 'ללא כותרת'),
                App.el('div', { style: { fontSize: '12px', color: 'var(--ink-soft)' } }, (n.body || '').slice(0, 80))
              ])
            ])
          ))
        : App.el('div', { class: 'empty-state' }, 'עדיין אין הערות. קדימה, להתחיל לכתוב ←')
    ]);

    root.append(
      App.el('div', { class: 'stack stack-lg' }, [
        stats,
        App.el('h2', { style: { marginTop: '8px' } }, 'הכול במקום אחד'),
        sectionGrid,
        notesCard
      ])
    );
  }

  function statCard(color, value, label, sub) {
    return App.el('div', { class: `stat ${color}` }, [
      App.el('div', { class: 'stat-label' }, label),
      App.el('div', { class: 'stat-value' }, String(value)),
      App.el('div', { class: 'stat-sub' }, sub || '')
    ]);
  }

  function moodEmoji(level) {
    return ['—', '😞', '😕', '😐', '🙂', '😄'][level || 0];
  }

  App.register('dashboard', render);
})();
