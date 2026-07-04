(function () {
  const DAY_NAMES = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
  let weekOffset = 0;

  function weekDates() {
    const d = new Date();
    const sun = new Date(d);
    sun.setDate(d.getDate() - d.getDay() + weekOffset * 7);
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
    const isCurrentWeek = weekOffset === 0;

    const startLabel = dates[0].toLocaleDateString('he-IL', { day: 'numeric', month: 'long' });
    const endLabel   = dates[6].toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });

    const navBar = App.el('div', { class: 'row row-between', style: { marginBottom: '8px' } }, [
      App.el('button', { class: 'btn btn-sm', onClick: () => { weekOffset--; rerender(); } }, '→ שבוע קודם'),
      App.el('div', { class: 'row', style: { gap: '8px' } }, [
        App.el('span', { class: 'chip' + (isCurrentWeek ? ' sage' : ' lavender') }, `${endLabel} – ${startLabel}`),
        !isCurrentWeek ? App.el('button', { class: 'btn btn-sm', onClick: () => { weekOffset = 0; rerender(); } }, 'השבוע') : null
      ]),
      App.el('button', { class: 'btn btn-sm', onClick: () => { weekOffset++; rerender(); } }, 'שבוע הבא ←')
    ]);

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
            rerender();
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
        rerender();
      });

      return col;
    });

    root.append(
      App.el('div', { class: 'stack stack-lg' }, [
        navBar,
        App.el('div', { class: 'card' }, [
          App.el('div', { class: 'row row-between' }, [
            App.el('h2', {}, 'השבוע שלי'),
            App.el('span', { class: 'chip sage' }, 'גרירה מזיזה בין ימי השבוע · 📅 מעביר לכל תאריך')
          ]),
          App.el('div', { class: 'week-grid', style: { marginTop: '16px' } }, columns)
        ])
      ])
    );
  }

  function taskPill(t) {
    const textSpan = App.el('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' } }, t.text);
    const delBtn = App.el('span', {
      class: 'pill-del', title: 'מחיקה',
      onClick: (e) => {
        e.stopPropagation();
        Store.set('tasks', (Store.get('tasks') || []).filter(x => x.id !== t.id));
        rerender();
      }
    }, '✕');

    // ── העברה לכל תאריך (לא רק בתוך השבוע המוצג) ──────────────────────────
    // בורר תאריכים נייטיבי, נסתר; value בפורמט YYYY-MM-DD = בדיוק Store.dateKey.
    const dateInput = App.el('input', {
      type: 'date',
      style: { position: 'absolute', width: '0', height: '0', opacity: '0', border: '0', padding: '0' }
    });
    dateInput.addEventListener('click', (e) => e.stopPropagation());
    dateInput.addEventListener('change', () => {
      const v = dateInput.value;
      if (!v || v === t.date) return;
      Store.set('tasks', (Store.get('tasks') || []).map(x => x.id === t.id ? { ...x, date: v } : x));
      // עיגון T12:00 כדי שהתצוגה לא תגלוש יום אחורה באזור-זמן חיובי
      App.toast('📅 המשימה הועברה ל' + new Date(v + 'T12:00').toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }));
      rerender();
    });
    const moveBtn = App.el('span', {
      class: 'pill-move', title: 'העבר לתאריך אחר — כל תאריך',
      onClick: (e) => {
        e.stopPropagation();
        dateInput.value = t.date || Store.todayKey();
        try { dateInput.showPicker(); } catch (_) { dateInput.click(); }
      },
      onDblclick: (e) => e.stopPropagation()
    }, '📅');

    const el = App.el('div', {
      class: 'task-pill',
      draggable: 'true',
      title: 'לחיצה: סימון כבוצע · לחיצה כפולה: עריכה · 📅 העברה לכל תאריך',
      style: { display: 'flex', alignItems: 'center', gap: '4px' },
      onClick: (e) => {
        if (e.target.classList.contains('pill-del') || e.target.classList.contains('pill-move')) return;
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
    }, [textSpan, moveBtn, delBtn, dateInput]);

    if (t.done) { textSpan.style.textDecoration = 'line-through'; el.style.opacity = '.6'; }
    el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', t.id); el.classList.add('dragging'); });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    return el;
  }

  function rerender() {
    const root = document.querySelector('.cal-sub');
    if (root) { root.innerHTML = ''; render(root); }
  }

  App.register('weekly', render);
})();
