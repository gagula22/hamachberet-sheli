(function () {
  // Wyckoff dashboard card. Registers ITSELF as a dashboard widget, so the
  // dashboard needs zero knowledge of Wyckoff. Opens reports / launches the
  // symbol picker (window.Wyckoff.openSymbolPicker).
  function renderWyckoffCard() {
    return App.el('div', { class: 'card', title: 'כדי שהפקת ניתוח חדש תצליח — חובה שתוכנת TradingView תהיה מותקנת ופתוחה במחשב (הדוח מופק דרך לכידת גרפים מ-TradingView). זה שונה מ"ניתוח לפי וויקוף" שרץ עצמאית מ-Binance ללא תוכנה.', style: { background: 'linear-gradient(135deg, #fff8e7 0%, #ffe5e5 100%)', borderLeft: '4px solid #d4a017' } }, [
      App.el('div', { class: 'row row-between' }, [
        App.el('h2', { style: { margin: 0 } }, '📊 ניתוח Wyckoff — BTCUSDT.P'),
        App.el('span', { style: { fontSize: '11px', color: 'var(--ink-soft)' } }, 'BYBIT')
      ]),
      App.el('div', { style: { fontSize: '13px', color: 'var(--ink-soft)', margin: '8px 0' } },
        'דוח אחרון: 1D + 4H + 1H + 30m + 15m עם אסטרטגיית 3 שלבים, ווליום פר 1%, ותרחישים'),
      App.el('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, [
        App.el('button', {
          class: 'btn btn-primary',
          style: { background: '#d4a017', borderColor: '#d4a017' },
          onClick: () => { window.open('wyckoff/latest.html', '_blank'); }
        }, '📊 פתח דוח אחרון'),
        App.el('button', {
          class: 'btn btn-primary',
          style: { background: '#0a7', borderColor: '#0a7' },
          onClick: (ev) => window.Wyckoff.openSymbolPicker(ev.currentTarget)
        }, '🚀 הפק ניתוח חדש'),
        App.el('button', {
          class: 'btn btn-ghost btn-sm',
          onClick: () => { window.open('wyckoff/', '_blank'); }
        }, '📁 כל הדוחות'),
      ])
    ]);
  }

  renderWyckoffCard.order = 10;   // כרטיס הסחר הראשי — ראשון בין הווידג'טים
  (window.DASHBOARD_WIDGETS = window.DASHBOARD_WIDGETS || []).push(renderWyckoffCard);
})();
