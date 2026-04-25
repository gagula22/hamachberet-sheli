(function () {
  const EMOJIS = ['😞','😕','😐','🙂','😄'];

  function render(root) {
    const today = Store.todayKey();
    const mood = Store.get('mood') || {};
    const current = mood[today];

    const picker = App.el('div', { class: 'mood-row' },
      EMOJIS.map((e, i) =>
        App.el('button', {
          class: 'mood-btn' + (current === i + 1 ? ' selected' : ''),
          onClick: () => {
            const m = Store.get('mood') || {};
            m[today] = i + 1;
            Store.set('mood', m);
            document.getElementById('view').innerHTML = '';
            render(document.getElementById('view'));
          }
        }, e)
      )
    );

    const days = [];
    const d = new Date();
    for (let i = 29; i >= 0; i--) {
      const x = new Date(d); x.setDate(d.getDate() - i);
      days.push(x);
    }

    const strip = App.el('div', { class: 'mood-strip' },
      days.map(day => {
        const key = Store.dateKey(day);
        const lvl = mood[key];
        return App.el('div', {
          class: 'mood-day',
          title: `${key}${lvl ? ' — ' + EMOJIS[lvl-1] : ''}`,
          style: lvl ? { background: tint(lvl) } : {}
        }, lvl ? EMOJIS[lvl - 1] : '');
      })
    );

    const reflection = App.el('textarea', {
      class: 'textarea',
      placeholder: 'מה השפיע על מצב הרוח שלך היום?',
      onInput: Editable.debounce((e) => {
        const m = Store.get('mood') || {};
        m[today + ':note'] = e.target.value;
        Store.set('mood', m);
      }, 400)
    });
    reflection.value = mood[today + ':note'] || '';

    root.append(
      App.el('div', { class: 'stack stack-lg' }, [
        App.el('div', { class: 'card' }, [
          App.el('div', { class: 'mood-header-row' }, [
            App.el('span', { class: 'mood-question' }, 'איך אתה מרגיש היום?'),
            picker
          ]),
          reflection
        ]),
        App.el('div', { class: 'card' }, [
          App.el('h2', {}, '30 הימים האחרונים'),
          App.el('div', { style: { marginTop: '16px' } }, strip)
        ])
      ])
    );
  }

  function tint(lvl) {
    return ['#FADADD','#FBE4D5','#FFF3C4','#E3F0D8','#CDE7C1'][lvl - 1];
  }

  App.register('mood', render);
})();
