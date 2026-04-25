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

        // Paste-JSON button (for migrating from file:// local version)
        const pasteBtn = document.createElement('button');
        pasteBtn.textContent = '📋 הדבק';
        pasteBtn.title = 'הדבק JSON שהועתק מהגרסה המקומית';
        pasteBtn.style.cssText = _btnStyle('#e3f2fd','#1565c0');
        pasteBtn.addEventListener('click', () => {
          const overlay = document.createElement('div');
          overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.45);display:grid;place-items:center';
          overlay.innerHTML = `
            <div style="background:#fff;border-radius:16px;padding:28px;width:min(480px,92vw);display:flex;flex-direction:column;gap:14px;direction:rtl;font-family:inherit">
              <div style="font-size:17px;font-weight:600">הדבק נתונים מהגרסה המקומית</div>
              <div style="font-size:13px;color:#666;line-height:1.6">פתח את הקובץ המקומי, לחץ F12 → Console והדבק:<br>
                <code style="background:#f5f5f5;padding:2px 6px;border-radius:4px;font-size:12px">copy(JSON.stringify(Store.get()))</code><br>
                ואז חזור לכאן והדבק את הטקסט בתיבה:
              </div>
              <textarea id="paste-json-area" rows="6" placeholder='{"notes":[],"tasks":[],...}'
                style="width:100%;border:1px solid #ddd;border-radius:8px;padding:10px;font-size:12px;font-family:monospace;resize:vertical;box-sizing:border-box"></textarea>
              <div style="display:flex;gap:8px;justify-content:flex-end">
                <button id="paste-cancel" style="${_btnStyle('#f5f5f5','#555')}cursor:pointer">ביטול</button>
                <button id="paste-ok" style="${_btnStyle('#e8f5e9','#2e7d32')}cursor:pointer">ייבא ✓</button>
              </div>
            </div>`;
          document.body.appendChild(overlay);
          document.getElementById('paste-cancel').addEventListener('click', () => overlay.remove());
          document.getElementById('paste-ok').addEventListener('click', async () => {
            const text = document.getElementById('paste-json-area').value.trim();
            if (!text) { App.toast('אין טקסט להדביק'); return; }
            try {
              const file = new File([text], 'data.json', { type: 'application/json' });
              await Store.importJSON(file);
              overlay.remove();
              App.toast('הנתונים יובאו ✓ — מסנכרן לענן…');
            } catch { App.toast('שגיאה — ודא שהטקסט הוא JSON תקין'); }
          });
        });

        bar.appendChild(exportBtn);
        bar.appendChild(importLabel);
        bar.appendChild(pasteBtn);
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
