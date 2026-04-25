(function () {
  const CATEGORIES = ['אוכל','חשבונות','תחבורה','בילויים','קניות','בריאות','חיסכון','אחר'];

  function render(root) {
    const tx = Store.get('transactions') || [];
    const month = new Date().toISOString().slice(0, 7);
    const monthTx = tx.filter(t => (t.date || '').startsWith(month));
    const income = monthTx.filter(t => t.type === 'inc').reduce((s, t) => s + t.amount, 0);
    const expense = monthTx.filter(t => t.type === 'exp').reduce((s, t) => s + t.amount, 0);
    const net = income - expense;

    const form = buildForm();

    const txList = App.el('div', { class: 'stack' });
    function renderList() {
      txList.innerHTML = '';
      const list = (Store.get('transactions') || []).slice().reverse();
      if (!list.length) {
        txList.appendChild(App.el('div', { class: 'empty-state' }, 'עדיין אין תנועות'));
        return;
      }
      list.forEach(t => {
        const noteLabel = t.note || t.category;
        const noteEl = App.el('div', {
          class: 'editable-text',
          contenteditable: 'true',
          title: 'לחץ לעריכת ההערה',
          style: { fontWeight: 500 },
          onBlur: (e) => {
            const v = e.target.textContent.trim();
            const orig = t.note || '';
            if (v !== orig) {
              Store.set('transactions', (Store.get('transactions') || []).map(x => x.id === t.id ? { ...x, note: v } : x));
            }
          },
          onKeydown: (e) => {
            if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
            if (e.key === 'Escape') { e.target.textContent = noteLabel; e.target.blur(); }
          }
        }, noteLabel);

        const amtEl = App.el('div', {
          class: 'tx-amt editable-text ' + (t.type === 'inc' ? 'inc' : 'exp'),
          contenteditable: 'true',
          title: 'לחץ לעריכת סכום',
          onBlur: (e) => {
            const raw = e.target.textContent.replace(/[^\d.]/g, '');
            const num = parseFloat(raw);
            if (num && num > 0 && num !== t.amount) {
              Store.set('transactions', (Store.get('transactions') || []).map(x => x.id === t.id ? { ...x, amount: num } : x));
            }
            document.getElementById('view').innerHTML = '';
            render(document.getElementById('view'));
          },
          onKeydown: (e) => {
            if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
            if (e.key === 'Escape') { e.target.textContent = (t.type === 'inc' ? '+' : '−') + '₪' + t.amount.toFixed(2); e.target.blur(); }
          }
        }, (t.type === 'inc' ? '+' : '−') + '₪' + t.amount.toFixed(2));

        txList.appendChild(App.el('div', { class: 'tx-item' }, [
          App.el('div', { class: 'tx-icon ' + (t.type === 'inc' ? 'inc' : 'exp') }, t.type === 'inc' ? '↑' : '↓'),
          App.el('div', {}, [
            noteEl,
            App.el('div', { style: { fontSize: '12px', color: 'var(--ink-soft)' } }, `${t.category} · ${t.date}`)
          ]),
          amtEl,
          App.el('button', {
            class: 'btn-icon',
            onClick: () => {
              Store.set('transactions', (Store.get('transactions') || []).filter(x => x.id !== t.id));
              document.getElementById('view').innerHTML = '';
              render(document.getElementById('view'));
            }
          }, '✕')
        ]));
      });
    }
    renderList();

    const summary = App.el('div', { class: 'budget-summary' }, [
      App.el('div', { class: 'stat sage' }, [
        App.el('div', { class: 'stat-label' }, 'הכנסות'),
        App.el('div', { class: 'stat-value' }, '₪' + income.toFixed(2))
      ]),
      App.el('div', { class: 'stat blush' }, [
        App.el('div', { class: 'stat-label' }, 'הוצאות'),
        App.el('div', { class: 'stat-value' }, '₪' + expense.toFixed(2))
      ]),
      App.el('div', { class: 'stat ' + (net >= 0 ? 'sky' : 'butter') }, [
        App.el('div', { class: 'stat-label' }, 'יתרה'),
        App.el('div', { class: 'stat-value' }, (net >= 0 ? '+' : '−') + '₪' + Math.abs(net).toFixed(2))
      ])
    ]);

    root.append(
      App.el('div', { class: 'stack stack-lg' }, [
        summary,
        App.el('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)', gap: '16px' } }, [
          App.el('div', { class: 'card' }, [
            App.el('h3', {}, 'הוספת תנועה'),
            form
          ]),
          App.el('div', { class: 'card' }, [
            App.el('h3', {}, `${monthTx.length} תנועות החודש`),
            txList
          ])
        ])
      ])
    );

    function buildForm() {
      const type = App.el('select', { class: 'input' }, [
        App.el('option', { value: 'exp' }, 'הוצאה'),
        App.el('option', { value: 'inc' }, 'הכנסה')
      ]);
      const amount = App.el('input', { class: 'input', type: 'number', step: '0.01', placeholder: 'סכום' });
      const category = App.el('select', { class: 'input' }, CATEGORIES.map(c => App.el('option', { value: c }, c)));
      const note = App.el('input', { class: 'input', placeholder: 'הערה (רשות)' });
      const date = App.el('input', { class: 'input', type: 'date', value: Store.todayKey() });

      const btn = App.el('button', {
        class: 'btn',
        onClick: () => {
          const amt = parseFloat(amount.value);
          if (!amt || amt <= 0) { App.toast('הזן סכום תקין'); return; }
          const list = Store.get('transactions') || [];
          list.push({
            id: Store.uid(),
            type: type.value,
            amount: amt,
            category: category.value,
            note: note.value.trim(),
            date: date.value
          });
          Store.set('transactions', list);
          amount.value = ''; note.value = '';
          App.toast('נשמר');
          document.getElementById('view').innerHTML = '';
          render(document.getElementById('view'));
        }
      }, 'הוסף');

      return App.el('div', { class: 'stack' }, [
        App.el('div', { class: 'grid', style: { gridTemplateColumns: '1fr 1fr', gap: '8px' } }, [type, amount]),
        category, note, date, btn
      ]);
    }
  }

  App.register('budget', render);
})();
