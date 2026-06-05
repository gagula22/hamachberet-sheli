(function () {
  // Wyckoff symbol picker (UI). Uses window.WyckoffAPI + opens the progress modal.
  async function openSymbolPickerModal(triggerBtn) {
    // Remove existing modal if any
    const existing = document.getElementById('symbol-picker-overlay');
    if (existing) existing.remove();

    const allSymbols = await window.WyckoffAPI.loadWatchlist();
    if (!allSymbols.length) {
      alert('לא נמצאו מטבעות. נסה/י שוב בעוד דקה (TradingView צריך לרוץ עם CDP).');
      return;
    }
    let currentFilter = 'perp'; // 'perp' | 'spot' | 'all'
    // Default-select the first symbol VISIBLE under the initial filter, so a blind
    // "send" never fires a hidden default (e.g. CRYPTOCAP:BTC.D — a macro symbol the
    // 'perp' tab hides and the validator used to reject → "פורמט שגוי").
    let selectedSymbol = (allSymbols.find(s => s.type === currentFilter) || allSymbols[0]).symbol;

    // Overlay
    const overlay = document.createElement('div');
    overlay.id = 'symbol-picker-overlay';
    overlay.style.cssText = `position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:9999;
      display:flex; align-items:center; justify-content:center; padding:20px;`;
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    // Modal box
    const modal = document.createElement('div');
    modal.style.cssText = `background:#fff; border-radius:12px; padding:24px; max-width:520px; width:100%;
      box-shadow:0 10px 40px rgba(0,0,0,0.3); direction:rtl; max-height:90vh; overflow-y:auto;`;

    const title = document.createElement('h2');
    title.textContent = '🚀 בחר מטבע לניתוח Wyckoff';
    title.style.cssText = 'margin:0 0 8px; color:#0a4; font-size:1.3rem;';
    modal.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.textContent = `${allSymbols.length} מטבעות זמינים מהווצ'ליסט שלך ב-TradingView. בחר/י את המטבע לניתוח Wyckoff.`;
    subtitle.style.cssText = 'margin:0 0 14px; color:#666; font-size:0.92rem;';
    modal.appendChild(subtitle);

    // Filter tabs (perp / spot / all)
    const tabsWrap = document.createElement('div');
    tabsWrap.style.cssText = 'display:flex; gap:6px; margin-bottom:12px; border-bottom:1px solid #e5e7eb; padding-bottom:8px;';

    function tabBtn(label, value) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.dataset.filter = value;
      const isActive = currentFilter === value;
      btn.style.cssText = `padding:6px 14px; border-radius:6px; font-size:0.9rem; cursor:pointer;
        border:1px solid ${isActive ? '#0a7' : '#d1d5db'};
        background:${isActive ? '#0a7' : '#fff'};
        color:${isActive ? '#fff' : '#374151'};
        font-weight:${isActive ? 600 : 400};`;
      btn.onclick = () => {
        currentFilter = value;
        // Keep the selection visible inside the new filter so it always matches what's shown.
        const visible = allSymbols.filter(s => value === 'all' || s.type === value);
        if (visible.length && !visible.some(s => s.symbol === selectedSymbol)) selectedSymbol = visible[0].symbol;
        renderTabs(); renderList();
      };
      return btn;
    }

    function renderTabs() {
      tabsWrap.innerHTML = '';
      const counts = {
        perp:  allSymbols.filter(s => s.type === 'perp').length,
        spot:  allSymbols.filter(s => s.type === 'spot').length,
        macro: allSymbols.filter(s => s.type === 'macro').length,
        index: allSymbols.filter(s => s.type === 'index').length,
      };
      tabsWrap.appendChild(tabBtn(`הכל (${allSymbols.length})`, 'all'));
      if (counts.perp)  tabsWrap.appendChild(tabBtn(`🔥 Perp (${counts.perp})`, 'perp'));
      if (counts.spot)  tabsWrap.appendChild(tabBtn(`💎 Spot (${counts.spot})`, 'spot'));
      if (counts.macro) tabsWrap.appendChild(tabBtn(`🌐 Macro (${counts.macro})`, 'macro'));
      if (counts.index) tabsWrap.appendChild(tabBtn(`📈 Index (${counts.index})`, 'index'));
    }
    renderTabs();
    modal.appendChild(tabsWrap);

    // Search box
    const searchBox = document.createElement('input');
    searchBox.type = 'text';
    searchBox.placeholder = '🔍 חיפוש (לדוגמה: BTC, SOL, ETH)';
    searchBox.style.cssText = `width:100%; padding:8px 12px; border:1px solid #d1d5db; border-radius:6px;
      font-size:0.92rem; margin-bottom:10px; box-sizing:border-box;`;
    searchBox.oninput = () => renderList();
    modal.appendChild(searchBox);

    // Symbol list (scrollable)
    const listWrap = document.createElement('div');
    listWrap.style.cssText = 'display:flex; flex-direction:column; gap:6px; margin-bottom:16px; max-height:280px; overflow-y:auto; padding:2px;';

    function renderList() {
      const filtered = allSymbols.filter(s => {
        if (currentFilter !== 'all' && s.type !== currentFilter) return false;
        const q = searchBox.value.trim().toUpperCase();
        if (q && !s.symbol.toUpperCase().includes(q) && !s.label.toUpperCase().includes(q)) return false;
        return true;
      });
      listWrap.innerHTML = '';
      if (!filtered.length) {
        const empty = document.createElement('div');
        empty.textContent = '— אין תוצאות —';
        empty.style.cssText = 'text-align:center; color:#999; padding:24px;';
        listWrap.appendChild(empty);
        return;
      }
      filtered.forEach(s => {
        const isSelected = (s.symbol === selectedSymbol);
        const row = document.createElement('button');
        row.type = 'button';
        const typeBadge = s.type === 'perp' ? '🔥' : '📊';
        row.innerHTML = `<span style="font-size:0.85em; color:#666; margin-left:8px;">${typeBadge}</span> ${s.label || s.symbol}`;
        row.style.cssText = `text-align:right; padding:9px 12px; border-radius:7px;
          border:2px solid ${isSelected ? '#0a7' : '#e5e7eb'};
          background:${isSelected ? '#ecfdf5' : '#fff'};
          font-size:0.93rem; cursor:pointer; transition:all 0.12s;
          font-weight:${isSelected ? 600 : 400}; color:${isSelected ? '#065f46' : '#1f2937'};`;
        row.onclick = () => { selectedSymbol = s.symbol; renderList(); customInput.value = ''; };
        row.onmouseover = () => { if (!isSelected) row.style.background = '#f9fafb'; };
        row.onmouseout = () => { if (!isSelected) row.style.background = '#fff'; };
        listWrap.appendChild(row);
      });
    }
    renderList();
    modal.appendChild(listWrap);

    // Custom symbol input
    const customLabel = document.createElement('div');
    customLabel.textContent = 'או הזן מטבע מותאם (פורמט BYBIT:XXXUSDT.P):';
    customLabel.style.cssText = 'font-size:0.88rem; color:#666; margin:8px 0 6px;';
    modal.appendChild(customLabel);

    const customInput = document.createElement('input');
    customInput.type = 'text';
    customInput.placeholder = 'BYBIT:AVAXUSDT.P';
    customInput.style.cssText = `width:100%; padding:10px 12px; border:1px solid #d1d5db; border-radius:8px;
      font-size:0.95rem; direction:ltr; text-align:left; box-sizing:border-box;`;
    customInput.oninput = () => {
      const val = customInput.value.trim().toUpperCase();
      if (val) {
        selectedSymbol = val;
        // Visually unselect the preset rows
        Array.from(listWrap.querySelectorAll('button')).forEach(b => {
          b.style.border = '2px solid #e5e7eb';
          b.style.background = '#fff';
          b.style.fontWeight = 400;
          b.style.color = '#1f2937';
        });
      }
    };
    modal.appendChild(customInput);

    // Action buttons
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex; gap:10px; justify-content:flex-start; margin-top:22px;';

    const cancel = document.createElement('button');
    cancel.textContent = 'ביטול';
    cancel.style.cssText = 'padding:10px 22px; border-radius:8px; border:1px solid #d1d5db; background:#fff; cursor:pointer; font-size:0.95rem;';
    cancel.onclick = () => overlay.remove();
    actions.appendChild(cancel);

    const send = document.createElement('button');
    send.textContent = '🚀 שלח טריגר';
    send.style.cssText = 'padding:10px 24px; border-radius:8px; border:none; background:#0a7; color:#fff; cursor:pointer; font-size:0.96rem; font-weight:600;';
    send.onclick = async () => {
      // Use custom input value if set, else selectedSymbol
      const customVal = customInput.value.trim().toUpperCase();
      const finalSymbol = customVal || selectedSymbol;
      // Accept every real TradingView shape that appears in the watchlist:
      // SRC:TICKER, suffixes like .P / .D, and ratio symbols with "/" and multiple ":".
      // (The old /^([A-Z]+:)?[A-Z0-9]+(\.P)?$/ wrongly rejected CRYPTOCAP:BTC.D etc.)
      if (!finalSymbol.match(/^[A-Z0-9][A-Z0-9.:\/]*$/)) {
        alert('פורמט שגוי. דוגמאות תקינות:\n• BYBIT:BTCUSDT.P\n• CRYPTOCAP:BTC.D\n• SOLUSDT.P');
        return;
      }
      send.disabled = true;
      send.textContent = '⏳ שולח...';
      try {
        await window.WyckoffAPI.triggerAnalysis(finalSymbol);
        send.textContent = '✅ נשלח';
        overlay.remove();
        if (triggerBtn) {
          triggerBtn.textContent = `✅ נשלח: ${finalSymbol.replace('BYBIT:', '').replace('.P', '')}`;
          setTimeout(() => { triggerBtn.textContent = '🚀 הפק ניתוח חדש'; }, 5000);
        }
        window.openWyckoffProgressModal && window.openWyckoffProgressModal();
      } catch (e) {
        send.disabled = false;
        send.textContent = '🚀 שלח טריגר';
        alert('שליחת הטריגר נכשלה:\n' + e.message + '\n\nוודא ש-Cloudflare Worker פעיל.');
      }
    };
    actions.appendChild(send);

    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }
  window.Wyckoff = { openSymbolPicker: openSymbolPickerModal };
})();