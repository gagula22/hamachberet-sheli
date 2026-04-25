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

      // Export / Import buttons at the bottom of the sidebar
      const footer = document.querySelector('.sidebar-footer');
      if (footer) {
        const bar = document.createElement('div');
        bar.style.cssText = 'display:flex;gap:6px;margin-top:10px;justify-content:center';

        const exportBtn = document.createElement('button');
        exportBtn.textContent = '⬇ ייצוא';
        exportBtn.title = 'ייצא את כל הנתונים כקובץ גיבוי';
        exportBtn.style.cssText = _btnStyle('#e8f5e9','#388e3c');
        exportBtn.addEventListener('click', () => {
          Store.exportJSON();
          if (window.App) App.toast('הנתונים יוצאו בהצלחה ✓');
        });

        const importLabel = document.createElement('label');
        importLabel.textContent = '⬆ ייבוא';
        importLabel.title = 'ייבא קובץ גיבוי ועדכן את הנתונים';
        importLabel.style.cssText = _btnStyle('#fff3e0','#e65100') + 'cursor:pointer;';
        const importInput = document.createElement('input');
        importInput.type = 'file';
        importInput.accept = '.json,application/json';
        importInput.style.cssText = 'display:none';
        importInput.addEventListener('change', async () => {
          const file = importInput.files && importInput.files[0];
          if (!file) return;
          try {
            await Store.importJSON(file);
            if (window.App) App.toast('הנתונים יובאו ✓ — מסנכרן לענן…');
          } catch {
            if (window.App) App.toast('שגיאה בקריאת הקובץ');
          }
          importInput.value = '';
        });
        importLabel.appendChild(importInput);

        bar.appendChild(exportBtn);
        bar.appendChild(importLabel);
        footer.after(bar);
      }
    },

    setActive(id) {
      document.querySelectorAll('.nav-item').forEach(n => {
        n.classList.toggle('active', n.dataset.id === id);
      });
    }
  };

  function _btnStyle(bg, color) {
    return `background:${bg};color:${color};border:1px solid ${color}33;padding:6px 12px;` +
           `border-radius:8px;font-size:12px;font-weight:600;font-family:inherit;`;
  }

  window.Sidebar = Sidebar;
})();
