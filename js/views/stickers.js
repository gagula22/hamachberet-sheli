(function () {
  // 'כלים' (Tools) view — a friendly category grid of tool tiles. Clicking a
  // tile opens that tool in a popup MODAL. Each tool is its own module under
  // js/views/tools/ exposing window.Tools.*; this file only composes them.
  // The tool's card is built lazily on first open and cached (keeps its state).

  function _wrapWithAccent(card, gradient) {
    var stripe = App.el('div', {
      style: { height: '4px', borderTopLeftRadius: 'var(--r-md)', borderTopRightRadius: 'var(--r-md)',
               background: gradient, margin: '-24px -24px 18px' }
    });
    if (card && card.firstChild) card.insertBefore(stripe, card.firstChild);
    else if (card) card.appendChild(stripe);
    return card;
  }

  // ── Tool registry by category ─────────────────────────────────────────────
  function categories() {
    function t(icon, label, bg, desc, build) {
      return { icon: icon, label: label, bg: 'linear-gradient(135deg,' + bg + ')',
               accent: 'linear-gradient(90deg,' + bg + ')', desc: desc, build: build };
    }
    return [
      { title: '📂 המרת מסמכים', tools: [
        t('📝', 'Word → PDF', '#FADADD,#F3B7BD', 'ממיר מסמך Word (.doc/.docx) ל-PDF — הורדה אוטומטית, התמונות נשמרות.', function () { return window.Tools.wordToPdf(); }),
        t('📄', 'PDF → Word', '#E6DDF4,#C9B8E3', 'ממיר PDF ל-Word נערך (כולל שחזור עברית מקודדת), או למראה מדויק כתמונות.', function () { return window.Tools.pdfToWord(); }),
        t('🌐', 'תרגום PDF', '#FFF3C4,#F5DF8C', 'מחלץ טקסט מ-PDF ומתרגם אותו לשפה שתבחרי.', function () { return window.Tools.pdfTranslator(); }),
        t('🎬', 'תמלול וידאו', '#CFE4F7,#A9CEEE', 'מתמלל וידאו/אודיו בעברית למסמך Word, עם צילומי מסך מהסרטון.', function () { return window.Tools.videoTranscriber(); })
      ] },
      { title: '📑 פעולות על דפים', tools: [
        t('🔗', 'מזג PDF', '#D9F0E3,#A9D8BE', 'מאחד כמה קובצי PDF לקובץ אחד, לפי הסדר שתבחרי.', function () { return window.Tools.pdfMerge(); }),
        t('✂️', 'פצל PDF', '#D9E8F5,#A9C9E8', 'מחלץ דפים נבחרים (למשל 1-3,5) לקובץ PDF חדש.', function () { return window.Tools.pdfSplit(); }),
        t('🗑️', 'מחק דפים', '#F5DCDC,#E8AEAE', 'מסיר דפים נבחרים מה-PDF ושומר את כל השאר.', function () { return window.Tools.pdfDelete(); }),
        t('🔄', 'סובב PDF', '#F0E6D2,#D8C39A', 'מסובב דפים ב-90/180/270 מעלות — את כל הדפים או חלק.', function () { return window.Tools.pdfRotate(); })
      ] },
      { title: '🖼️ תמונות', tools: [
        t('🖼️', 'PDF ל-JPG', '#E3DCF5,#BFA9E8', 'ממיר כל עמוד לתמונת JPG. כמה עמודים → קובץ zip.', function () { return window.Tools.pdfToJpg(); }),
        t('📄', 'תמונות ל-PDF', '#DCF0F5,#A9D8E8', 'מאחד תמונות JPG/PNG לקובץ PDF — תמונה לעמוד.', function () { return window.Tools.imgToPdf(); })
      ] },
      { title: '🛠️ אופטימיזציה ואבטחה', tools: [
        t('🗜️', 'דחס PDF', '#E8E2D2,#CFC0A0', 'מקטין נפח של PDF סרוק/כבד — בחירת רמת איכות.', function () { return window.Tools.pdfCompress(); }),
        t('📑', 'שטח טופס', '#DCEFE2,#AED8BF', 'מקבע שדות טופס כך שלא ניתן לערוך אותם יותר.', function () { return window.Tools.pdfFlatten(); }),
        t('🔓', 'בטל נעילה', '#F5E2DC,#E8BFA9', 'מסיר הגבלות הדפסה/העתקה מ-PDF נעול (לא סיסמת פתיחה).', function () { return window.Tools.pdfUnlock(); })
      ] }
    ];
  }

  // ── Hover tooltip (small popup explaining each tool) ──────────────────────
  var _tip = null;
  function _ensureTip() {
    if (_tip) return _tip;
    _tip = document.createElement('div');
    _tip.style.cssText = 'position:fixed;z-index:10000;max-width:240px;background:#3b3a3a;color:#fff;' +
      'font-size:12px;line-height:1.5;padding:8px 11px;border-radius:9px;box-shadow:0 8px 22px rgba(0,0,0,.28);' +
      'pointer-events:none;opacity:0;transition:opacity 120ms;font-family:inherit;direction:rtl;text-align:right;';
    document.body.appendChild(_tip);
    return _tip;
  }
  function showTip(target, text) {
    var tip = _ensureTip();
    tip.textContent = text;
    tip.style.display = 'block';
    tip.style.opacity = '0';
    var r = target.getBoundingClientRect();
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var left = r.left + r.width / 2 - tw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
    var top = r.top - th - 9;
    if (top < 8) top = r.bottom + 9;  // flip below if no room above
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    requestAnimationFrame(function () { if (_tip) _tip.style.opacity = '1'; });
  }
  function hideTip() { if (_tip) _tip.style.opacity = '0'; }

  // ── Popup modal ───────────────────────────────────────────────────────────
  function openModal(tool) {
    if (!tool._card) { tool._card = tool.build(); _wrapWithAccent(tool._card, tool.accent); }
    tool._card.style.display = '';

    var overlay = App.el('div', {
      style: { position: 'fixed', inset: '0', background: 'rgba(40,30,25,.5)', zIndex: '9999',
               display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
               padding: '48px 16px', overflowY: 'auto', backdropFilter: 'blur(2px)' }
    });
    var wrap = App.el('div', { style: { position: 'relative', maxWidth: '720px', width: '100%' } });
    var closeBtn = App.el('button', {
      style: { position: 'absolute', top: '-14px', left: '-10px', zIndex: '2',
               width: '36px', height: '36px', borderRadius: '50%', border: '1px solid var(--line)',
               background: '#fff', cursor: 'pointer', fontSize: '17px', color: 'var(--ink)',
               boxShadow: '0 4px 14px rgba(60,50,40,.18)', lineHeight: '1' }
    }, '✕');

    function close() { overlay.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    closeBtn.onclick = close;
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);

    wrap.appendChild(closeBtn);
    wrap.appendChild(tool._card);
    overlay.appendChild(wrap);
    document.body.appendChild(overlay);
  }

  // ── Tile ──────────────────────────────────────────────────────────────────
  function tile(tool) {
    var b = App.el('button', {
      style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
               padding: '18px 12px', background: '#fff', border: '1px solid var(--line)',
               borderRadius: '14px', cursor: 'pointer', fontFamily: 'inherit',
               boxShadow: 'var(--shadow-sm)', transition: 'transform 160ms ease-out, box-shadow 160ms, border-color 160ms' }
    }, [
      App.el('span', { style: { width: '48px', height: '48px', borderRadius: '14px', display: 'flex',
        alignItems: 'center', justifyContent: 'center', background: tool.bg, fontSize: '24px' } }, tool.icon),
      App.el('span', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--ink)', textAlign: 'center' } }, tool.label)
    ]);
    if (tool.desc) b.title = tool.desc;   // native fallback
    b.onclick = function () { openModal(tool); };
    b.onmouseenter = function () { b.style.transform = 'translateY(-2px)'; b.style.boxShadow = '0 8px 20px rgba(60,50,40,.13)'; b.style.borderColor = 'var(--ink)'; if (tool.desc) showTip(b, tool.desc); };
    b.onmouseleave = function () { b.style.transform = 'translateY(0)'; b.style.boxShadow = 'var(--shadow-sm)'; b.style.borderColor = 'var(--line)'; hideTip(); };
    b.addEventListener('click', hideTip);
    return b;
  }

  function render(root) {
    var hero = App.el('div', {
      style: { position: 'relative', overflow: 'hidden',
               background: 'linear-gradient(135deg,#FAF6F0 0%,#FFE9DA 35%,#E6DDF4 70%,#CFE4F7 100%)',
               borderRadius: 'var(--r-lg)', padding: '30px 34px', border: '1px solid var(--line)', boxShadow: 'var(--shadow-sm)' }
    }, [
      App.el('div', { style: { fontSize: '32px', marginBottom: '6px', letterSpacing: '-0.5px',
        fontFamily: 'var(--font-head)', fontWeight: '600', color: 'var(--ink)' } }, 'כלים ליצירת מסמכים'),
      App.el('div', { style: { fontSize: '14.5px', color: 'var(--ink-soft)', lineHeight: '1.6', maxWidth: '660px' } },
        'בחר כלי — הוא נפתח בחלון. הכל רץ מקומית בדפדפן, בלי להעלות קבצים לאף שרת.')
    ]);

    var sections = categories().map(function (c) {
      return App.el('div', {}, [
        App.el('div', { style: { fontSize: '15px', fontWeight: '600', color: 'var(--ink)',
          fontFamily: 'var(--font-head)', margin: '4px 0 12px' } }, c.title),
        App.el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: '12px' } },
          c.tools.map(tile))
      ]);
    });

    root.append(App.el('div', { class: 'stack stack-lg' }, [hero].concat(sections)));
  }
  App.register('stickers', render);
})();
