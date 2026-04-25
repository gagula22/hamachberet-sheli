(function () {
  const GOAL = 8;
  const DAY_LETTERS = ['א','ב','ג','ד','ה','ו','ש'];

  function render(root) {
    const today = Store.todayKey();
    const water = Store.get('water') || {};
    const count = water[today] || 0;
    const sleep = Store.get('sleep') || {};

    const glasses = App.el('div', { class: 'water-grid' },
      Array.from({ length: GOAL }, (_, i) =>
        App.el('div', {
          class: 'glass' + (i < count ? ' filled' : ''),
          onClick: () => {
            const w = Store.get('water') || {};
            w[today] = (i < count) ? i : i + 1;
            Store.set('water', w);
            document.getElementById('view').innerHTML = '';
            render(document.getElementById('view'));
          }
        })
      )
    );

    const sleepHours = App.el('input', {
      class: 'input',
      type: 'number',
      step: '0.5',
      min: '0', max: '14',
      placeholder: 'שעות שינה',
      value: sleep[today] ?? '',
      onChange: (e) => {
        const s = Store.get('sleep') || {};
        s[today] = parseFloat(e.target.value) || 0;
        Store.set('sleep', s);
      }
    });

    const days = [];
    const d = new Date();
    for (let i = 6; i >= 0; i--) { const x = new Date(d); x.setDate(d.getDate() - i); days.push(x); }
    const bars = App.el('div', { class: 'row', style: { alignItems: 'flex-end', gap: '10px', height: '140px', marginTop: '16px', direction: 'ltr' } },
      days.map(day => {
        const key = Store.dateKey(day);
        const h = sleep[key] || 0;
        const pct = Math.min(100, (h / 10) * 100);
        return App.el('div', { style: { flex: '1', textAlign: 'center' } }, [
          App.el('div', { style: { height: '100px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' } },
            App.el('div', {
              style: {
                width: '60%',
                height: pct + '%',
                background: 'linear-gradient(180deg, var(--sky) 0%, var(--lavender-deep) 100%)',
                borderRadius: '8px 8px 4px 4px',
                minHeight: '2px'
              }
            })
          ),
          App.el('div', { style: { fontSize: '11px', color: 'var(--ink-mute)', marginTop: '6px' } }, h ? `${h}ש` : '—'),
          App.el('div', { style: { fontSize: '10px', color: 'var(--ink-mute)' } }, DAY_LETTERS[day.getDay()])
        ]);
      })
    );

    root.append(
      App.el('div', { class: 'grid grid-2' }, [
        App.el('div', { class: 'card' }, [
          App.el('h2', {}, '💧 שתייה'),
          App.el('div', { class: 'stat-sub', style: { marginBottom: '16px' } }, `${count} / ${GOAL} כוסות היום`),
          glasses
        ]),
        App.el('div', { class: 'card' }, [
          App.el('h2', {}, '🌙 שינה'),
          App.el('div', { class: 'row', style: { marginTop: '12px' } }, [sleepHours]),
          App.el('div', { class: 'stat-sub', style: { marginTop: '12px' } }, '7 הימים האחרונים'),
          bars
        ])
      ])
    );
  }

  App.register('water', render);
})();
