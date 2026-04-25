(function () {
  let dayOffset = 0;

  function getDate() {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return d;
  }

  function render(root) {
    const date = getDate();
    const key = Store.dateKey(date);
    const todayKey = Store.todayKey();
    const slots = Store.get('slots') || {};
    const daySlots = slots[key] || {};

    const hours = [];
    for (let h = 6; h <= 22; h++) hours.push(h);

    const topPriorities = daySlots.__top || ['', '', ''];

    const dateLabel = date.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
    const isToday = key === todayKey;

    const navBar = App.el('div', { class: 'row row-between', style: { marginBottom: '8px' } }, [
      App.el('button', { class: 'btn btn-sm', onClick: () => { dayOffset--; rerender(); } }, '→ יום קודם'),
      App.el('div', { class: 'row', style: { gap: '8px' } }, [
        App.el('span', { class: 'chip' + (isToday ? ' sage' : ' lavender') }, dateLabel),
        !isToday ? App.el('button', { class: 'btn btn-sm', onClick: () => { dayOffset = 0; rerender(); } }, 'היום') : null
      ]),
      App.el('button', { class: 'btn btn-sm', onClick: () => { dayOffset++; rerender(); } }, 'יום הבא ←')
    ]);

    const topCard = App.el('div', { class: 'card' }, [
      App.el('h2', {}, '3 המשימות הכי חשובות'),
      App.el('div', { class: 'stack' }, [0, 1, 2].map(i =>
        App.el('div', { class: 'row' }, [
          App.el('div', {
            class: 'checkbox' + (daySlots[`__done_${i}`] ? ' checked' : ''),
            onClick: (e) => {
              const cur = daySlots[`__done_${i}`];
              setSlot(key, `__done_${i}`, !cur);
              e.currentTarget.classList.toggle('checked', !cur);
            }
          }),
          App.el('input', {
            class: 'input',
            placeholder: `משימה ${i + 1}`,
            value: topPriorities[i] || '',
            onInput: Editable.debounce((e) => {
              const arr = ((Store.get('slots') || {})[key] || {}).__top || ['','',''];
              const copy = arr.slice();
              copy[i] = e.target.value;
              setSlot(key, '__top', copy);
            }, 300)
          })
        ])
      ))
    ]);

    const timelineCard = App.el('div', { class: 'card' }, [
      App.el('div', { class: 'row row-between' }, [
        App.el('h2', {}, 'ציר זמן'),
        App.el('span', { class: 'chip blush' }, dateLabel)
      ]),
      App.el('div', { class: 'timeline' }, hours.map(h =>
        App.el('div', { class: 'time-slot' }, [
          App.el('div', { class: 'hour' }, `${String(h).padStart(2,'0')}:00`),
          App.el('input', {
            class: 'slot-input',
            placeholder: h < 9 ? 'שגרת בוקר…' : h < 13 ? 'זמן פוקוס…' : h < 18 ? 'פגישה או משימה…' : 'להירגע…',
            value: daySlots[h] || '',
            onInput: Editable.debounce((e) => setSlot(key, h, e.target.value), 400)
          })
        ])
      ))
    ]);

    const notesTA = App.el('textarea', {
      class: 'textarea',
      placeholder: 'הרהורים, תזכורות, הכרת תודה…',
      onInput: Editable.debounce((e) => setSlot(key, '__notes', e.target.value), 400)
    });
    notesTA.value = daySlots.__notes || '';

    const notesCard = App.el('div', { class: 'card' }, [
      App.el('h2', {}, 'הערות ליום'),
      notesTA
    ]);

    root.append(
      App.el('div', { class: 'stack stack-lg' }, [
        navBar,
        App.el('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: '16px' } }, [
          timelineCard,
          App.el('div', { class: 'stack' }, [topCard, notesCard])
        ])
      ])
    );
  }

  function setSlot(day, key, value) {
    const slots = Store.get('slots') || {};
    slots[day] = slots[day] || {};
    slots[day][key] = value;
    Store.set('slots', slots);
  }

  function rerender() {
    const root = document.querySelector('.cal-sub');
    if (root) { root.innerHTML = ''; render(root); }
  }

  App.register('daily', render);
})();
