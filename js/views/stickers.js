(function () {
  // 'Tools' (Kelim) view shell. Each tool lives in its own module under
  // js/views/tools/. This file only composes them (hero + layout) and registers.
  // ── Page hero ─────────────────────────────────────────────────────────────
  // Chips behave as tabs over the *toggleable* cards (Word→PDF /
  // PDF→Word / תרגום PDF). The transcriber card lives below them and is
  // always visible — it's the primary tool, the user asked for it to
  // stay fixed.
  //
  // RTL note: the document is <html dir="rtl">, so flex-direction:row
  // places the first array item on the RIGHT.
  function buildHero(cards) {
    const tools = [
      { icon: '📝', label: 'Word → PDF',   bg: 'linear-gradient(135deg,#FADADD,#F3B7BD)', target: 'tool-w2p' }, // 1 (rightmost)
      { icon: '📄', label: 'PDF → Word',   bg: 'linear-gradient(135deg,#E6DDF4,#C9B8E3)', target: 'tool-p2w' }, // 2
      { icon: '🌐', label: 'תרגום PDF',    bg: 'linear-gradient(135deg,#FFF3C4,#F5DF8C)', target: 'tool-ptr' }, // 3
      { icon: '🔗', label: 'מזג PDF',      bg: 'linear-gradient(135deg,#D9F0E3,#A9D8BE)', target: 'tool-merge' } // 4
    ];

    const buttons = [];
    let activeId = null;   // start with no chip selected

    function _setActive(id) {
      // Clicking the active chip again toggles it off (back to "only
      // the transcriber is shown").
      if (id === activeId) id = null;
      activeId = id;
      // Show only the matching card; hide the other toggleable ones.
      Object.keys(cards).forEach(function(cid) {
        cards[cid].style.display = (cid === id) ? '' : 'none';
      });
      // Update chip styling.
      buttons.forEach(function(b) {
        var active = b._target === id;
        if (active) {
          b.style.background = '#fff';
          b.style.borderColor = 'var(--ink)';
          b.style.boxShadow = '0 4px 14px rgba(60,50,40,.14)';
          b.style.transform = 'translateY(-1px)';
        } else {
          b.style.background = 'rgba(255,255,255,.75)';
          b.style.borderColor = 'var(--line)';
          b.style.boxShadow = 'none';
          b.style.transform = 'translateY(0)';
        }
      });
    }

    const chips = tools.map(function(t) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn._target = t.target;
      btn.style.cssText = [
        'display:inline-flex',
        'align-items:center',
        'gap:8px',
        'padding:8px 14px',
        'border-radius:999px',
        'background:rgba(255,255,255,.75)',
        'border:1px solid var(--line)',
        'font-size:13px',
        'font-weight:600',
        'color:var(--ink)',
        'cursor:pointer',
        'font-family:inherit',
        'transition:transform 160ms ease-out, box-shadow 160ms ease-out, background 160ms, border-color 160ms'
      ].join(';');

      var iconSpan = document.createElement('span');
      iconSpan.textContent = t.icon;
      iconSpan.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:' + t.bg + ';font-size:13px;';

      var labelSpan = document.createElement('span');
      labelSpan.textContent = t.label;

      btn.appendChild(iconSpan);
      btn.appendChild(labelSpan);

      btn.onmouseover = function(){
        if (btn._target !== activeId) {
          btn.style.background = '#fff';
          btn.style.transform = 'translateY(-1px)';
          btn.style.boxShadow = '0 4px 12px rgba(60,50,40,.10)';
        }
      };
      btn.onmouseout = function(){
        if (btn._target !== activeId) {
          btn.style.background = 'rgba(255,255,255,.75)';
          btn.style.transform = 'translateY(0)';
          btn.style.boxShadow = 'none';
        }
      };
      btn.onclick = function(){ _setActive(t.target); };

      buttons.push(btn);
      return btn;
    });

    // Apply initial active state once the DOM is in place.
    setTimeout(function(){ _setActive(activeId); }, 0);

    return App.el('div', {
      style: {
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg,#FAF6F0 0%,#FFE9DA 35%,#E6DDF4 70%,#CFE4F7 100%)',
        borderRadius: 'var(--r-lg)',
        padding: '32px 36px',
        border: '1px solid var(--line)',
        boxShadow: 'var(--shadow-sm)'
      }
    }, [
      App.el('div', {
        style: { fontSize: '34px', marginBottom: '6px', letterSpacing: '-0.5px',
                 fontFamily: 'var(--font-head)', fontWeight: '600', color: 'var(--ink)' }
      }, 'כלים ליצירת מסמכים'),
      App.el('div', {
        style: { fontSize: '14.5px', color: 'var(--ink-soft)', marginBottom: '18px',
                 lineHeight: '1.6', maxWidth: '640px' }
      }, 'המרה, תרגום ותמלול בעברית — כל הכלים רצים ישר בדפדפן או בענן, בלי להעלות קבצים לאן שלא צריך.'),
      // RTL doc + justify-content:flex-start ⇒ chips hug the right edge,
      // first array item (Word→PDF) at the right.
      App.el('div', {
        style: { display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'flex-start' }
      }, chips)
    ]);
  }

  // ── Helper: wrap a tool card with a colored top accent stripe ─────────────
  function _wrapWithAccent(card, gradient) {
    // Add an inline gradient stripe at the top of the card.
    const stripe = App.el('div', {
      style: {
        height: '4px', borderTopLeftRadius: 'var(--r-md)',
        borderTopRightRadius: 'var(--r-md)',
        background: gradient,
        margin: '-24px -24px 18px'  // pull into card padding
      }
    });
    if (card && card.firstChild) card.insertBefore(stripe, card.firstChild);
    else if (card) card.appendChild(stripe);
    return card;
  }
  // -- Main render -- each tool is its own module (js/views/tools/*) ----------
  function render(root) {
    const w2p = window.Tools.wordToPdf();
    const p2w = window.Tools.pdfToWord();
    const ptr = window.Tools.pdfTranslator();
    const merge = window.Tools.pdfMerge();
    const vtr = window.Tools.videoTranscriber();

    w2p.id = 'tool-w2p';
    p2w.id = 'tool-p2w';
    ptr.id = 'tool-ptr';
    merge.id = 'tool-merge';
    vtr.id = 'tool-vtr';

    _wrapWithAccent(w2p, 'linear-gradient(90deg,#FADADD,#F3B7BD)');
    _wrapWithAccent(p2w, 'linear-gradient(90deg,#E6DDF4,#C9B8E3)');
    _wrapWithAccent(ptr, 'linear-gradient(90deg,#FFF3C4,#F5DF8C)');
    _wrapWithAccent(merge, 'linear-gradient(90deg,#D9F0E3,#A9D8BE)');
    _wrapWithAccent(vtr, 'linear-gradient(90deg,#CFE4F7,#A9CEEE)');

    const toggleCards = { 'tool-w2p': w2p, 'tool-p2w': p2w, 'tool-ptr': ptr, 'tool-merge': merge };
    Object.keys(toggleCards).forEach(function (id) { toggleCards[id].style.display = 'none'; });

    const hero = buildHero(toggleCards);

    root.append(App.el('div', { class: 'stack stack-lg' }, [hero, w2p, p2w, ptr, merge, vtr]));
  }
  App.register('stickers', render);
})();