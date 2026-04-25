(function () {
  function render(root) {
    const today = Store.todayKey();
    const slots = Store.get('slots') || {};
    const daySlots = slots[today] || {};

    const hours = [];
    for (let h = 6; h <= 22; h++) hours.push(h);

    const topPriorities = daySlots.__top || ['', '', ''];

    const topCard = App.el('div', { class: 'card' }, [
      App.el('h2', {}, '3 המשימות הכי חשובות להיום'),
      App.el('div', { class: 'stack' }, [0, 1, 2].map(i =>
        App.el('div', { class: 'row' }, [
          App.el('div', {
            class: 'checkbox' + (daySlots[`__done_${i}`] ? ' checked' : ''),
            onClick: (e) => {
              const cur = daySlots[`__done_${i}`];
              setSlot(today, `__done_${i}`, !cur);
              e.currentTarget.classList.toggle('checked', !cur);
            }
          }),
          App.el('input', {
            class: 'input',
            placeholder: `משימה ${i + 1}`,
            value: topPriorities[i] || '',
            onInput: Editable.debounce((e) => {
              const arr = (daySlots.__top || ['','','']).slice();
              arr[i] = e.target.value;
              setSlot(today, '__top', arr);
            }, 300)
          })
        ])
      ))
    ]);

    const timelineCard = App.el('div', { class: 'card' }, [
      App.el('div', { class: 'row row-between' }, [
        App.el('h2', {}, 'ציר זמן'),
        App.el('span', { class: 'chip blush' }, new Date().toLocaleDateString('he-IL', { weekday: 'long' }))
      ]),
      App.el('div', { class: 'timeline' }, hours.map(h =>
        App.el('div', { class: 'time-slot' }, [
          App.el('div', { class: 'hour' }, `${String(h).padStart(2,'0')}:00`),
          App.el('input', {
            class: 'slot-input',
            placeholder: h < 9 ? 'שגרת בוקר…' : h < 13 ? 'זמן פוקוס…' : h < 18 ? 'פגישה או משימה…' : 'להירגע…',
            value: daySlots[h] || '',
            onInput: Editable.debounce((e) => setSlot(today, h, e.target.value), 400)
          })
        ])
      ))
    ]);

    const notesTA = App.el('textarea', {
      class: 'textarea',
      placeholder: 'הרהורים, תזכורות, הכרת תודה…',
      onInput: Editable.debounce((e) => setSlot(today, '__notes', e.target.value), 400)
    });
    notesTA.value = daySlots.__notes || '';

    const notesCard = App.el('div', { class: 'card' }, [
      App.el('h2', {}, 'הערות ליום'),
      notesTA
    ]);

    root.append(
      App.el('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: '16px' } }, [
        timelineCard,
        App.el('div', { class: 'stack' }, [topCard, notesCard])
      ])
    );
  }

  function setSlot(day, key, value) {
    const slots = Store.get('slots') || {};
    slots[day] = slots[day] || {};
    slots[day][key] = value;
    Store.set('slots', slots);
  }

  App.register('daily', render);
})();
