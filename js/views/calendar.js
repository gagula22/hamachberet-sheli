(function () {
  const TABS = [
    { id: 'daily',   label: 'יומי',  icon: '📅' },
    { id: 'weekly',  label: 'שבועי', icon: '🗓️' },
    { id: 'monthly', label: 'חודשי', icon: '📆' }
  ];

  function render(root, sub) {
    if (!sub || !TABS.find(t => t.id === sub)) sub = 'daily';

    const tabBar = App.el('div', {
      class: 'tabs',
      style: { marginBottom: 'var(--sp-5)' }
    },
      TABS.map(t => App.el('button', {
        class: 'tab' + (t.id === sub ? ' active' : ''),
        onClick: () => { location.hash = `#/calendar/${t.id}`; }
      }, [
        App.el('span', { style: { marginInlineEnd: '6px' } }, t.icon),
        t.label
      ]))
    );

    const subView = App.el('div', { class: 'cal-sub' });

    root.append(App.el('div', { class: 'stack stack-lg' }, [tabBar, subView]));

    const subRender = App._routes[sub];
    if (subRender) subRender(subView);
  }

  App.register('calendar', render);
})();
