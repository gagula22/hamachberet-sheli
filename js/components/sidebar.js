(function () {
  const Sidebar = {
    render(sections) {
      const nav = document.getElementById('nav');
      nav.innerHTML = '';
      sections.forEach(s => {
        const btn = App.el('button', {
          class: 'nav-item',
          'data-id': s.id,
          onClick: () => { location.hash = `#/${s.id}`; }
        }, [
          App.el('span', { class: 'dot', style: { background: `var(--${s.color})` } }),
          App.el('span', { style: { fontSize: '16px' } }, s.icon),
          App.el('span', {}, s.title)
        ]);
        nav.appendChild(btn);
      });
    },
    setActive(id) {
      document.querySelectorAll('.nav-item').forEach(n => {
        n.classList.toggle('active', n.dataset.id === id);
      });
    }
  };
  window.Sidebar = Sidebar;
})();
