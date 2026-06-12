(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // מפת טיולים — ה-view (סוכן C: אינטגרציה). נרשם App.register('tripmap').
  // אחריות הקובץ: פריסה (מפה + סרגל צף + פאנל צד), חיפוש מקום (Nominatim),
  // אתחול המנוע, וניהול חיים (destroy כשעוזבים את ה-view).
  // תלויות (נכתבות במקביל ע"י סוכנים אחרים, לפי CONTRACT.md):
  //   TripMapEngine (סוכן A) — חובה. בלעדיו מוצגת הודעה ידידותית.
  //   TripMapStreet / TripMapControls (סוכן B) — רכות. בלעדיהן הכפתורים
  //     הרלוונטיים פשוט מודיעים שהיכולת לא זמינה.
  //   TripLayer (קובץ-אח, trip-layer.js) — שכבת תכנון הטיולים.
  // ─────────────────────────────────────────────────────────────────────────

  function el(t, a, k) { return App.el(t, a || {}, k || []); }

  // ── מצב חי של ה-view (קובץ אחד מחזיק את כל הקוראים/כותבים שלו) ──
  var _handle = null;       // ה-handle של TripMapEngine
  var _root = null;
  var _mo = null;           // MutationObserver שמזהה החלפת view
  var _unsubStore = null;   // רשת ביטחון נוספת (דפוס insights)
  var _streetOn = false;    // מצב "פקק" של תצוגת רחוב
  var _searchTimer = null;  // debounce לחיפוש
  var _searchAbort = null;  // ביטול בקשת חיפוש קודמת
  var _onWinResize = null;
  var _onDocClick = null;   // סגירת תוצאות החיפוש בלחיצה בחוץ

  // ── ניקוי מלא בעזיבת ה-view (ה-router פשוט מרוקן את #view) ──
  function cleanup() {
    clearTimeout(_searchTimer); _searchTimer = null;
    if (_searchAbort) { try { _searchAbort.abort(); } catch (e) {} _searchAbort = null; }
    if (_onWinResize) { window.removeEventListener('resize', _onWinResize); _onWinResize = null; }
    if (_onDocClick) { document.removeEventListener('click', _onDocClick); _onDocClick = null; }
    if (_unsubStore) { try { _unsubStore(); } catch (e) {} _unsubStore = null; }
    if (_mo) { try { _mo.disconnect(); } catch (e) {} _mo = null; }
    if (window.TripLayer && TripLayer.unmount) { try { TripLayer.unmount(); } catch (e) {} }
    if (_handle) {
      if (_streetOn && window.TripMapStreet && TripMapStreet.disableDropMode) {
        try { TripMapStreet.disableDropMode(_handle); } catch (e) {}
      }
      if (window.TripMapControls && TripMapControls.detach) {
        try { TripMapControls.detach(_handle); } catch (e) {}
      }
      try { _handle.destroy(); } catch (e) {}
    }
    _handle = null; _root = null; _streetOn = false;
  }

  // מעקב עזיבה: כשה-root כבר לא בעץ — מנקים ומתנתקים.
  function watchLifecycle(root) {
    var host = root.parentNode || document.body;
    _mo = new MutationObserver(function () {
      if (!document.contains(root)) cleanup();
    });
    _mo.observe(host, { childList: true });
    _unsubStore = Store.subscribe(function () {
      if (!document.contains(root)) cleanup();
    });
  }

  // ── מודאל קטן לפי מוסכמת הכלים (✕ / ESC / קליק רקע) ──
  function openModal(title, bodyEl) {
    var overlay = el('div', { class: 'tm-modal-overlay' });
    var box = el('div', { class: 'tm-modal card' }, [
      el('div', { class: 'tm-modal-head' }, [
        el('h2', {}, title),
        el('button', { class: 'tm-modal-close', title: 'סגירה' }, '✕')
      ]),
      bodyEl
    ]);
    function close() { overlay.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    box.querySelector('.tm-modal-close').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    return { close: close };
  }

  // ── חיפוש מקום: Nominatim (חינמי, debounce 400ms, בקשה אחת בתעופה) ──
  function searchPlaces(q) {
    if (_searchAbort) { try { _searchAbort.abort(); } catch (e) {} }
    _searchAbort = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=il&accept-language=he&q=' + encodeURIComponent(q);
    return fetch(url, {
      signal: _searchAbort ? _searchAbort.signal : undefined,
      headers: { 'Accept': 'application/json' }
    }).then(function (r) {
      if (!r.ok) throw new Error('nominatim ' + r.status);
      return r.json();
    });
  }

  function buildSearch() {
    var input = el('input', { class: 'tm-search-input', type: 'text', placeholder: '🔍 חפש מקום בישראל…' });
    var results = el('div', { class: 'tm-search-results', style: { display: 'none' } });
    var wrap = el('div', { class: 'tm-search' }, [input, results]);

    function hide() { results.style.display = 'none'; results.innerHTML = ''; }

    function show(list) {
      results.innerHTML = '';
      if (!list.length) {
        results.appendChild(el('div', { class: 'tm-search-empty' }, 'לא נמצאו תוצאות'));
      }
      list.forEach(function (p) {
        var lat = parseFloat(p.lat), lng = parseFloat(p.lon);
        if (!isFinite(lat) || !isFinite(lng)) return;
        var btn = el('button', { class: 'tm-search-item', title: p.display_name }, [
          el('span', { class: 'tm-search-name' }, (p.display_name || '').split(',')[0]),
          el('span', { class: 'tm-search-sub' }, (p.display_name || '').split(',').slice(1, 3).join(',').trim())
        ]);
        btn.addEventListener('click', function () {
          hide();
          input.value = (p.display_name || '').split(',')[0];
          if (!_handle) return;
          try {
            _handle.clearMarkers('search');   // marker זמני — אחד בכל רגע
            _handle.addMarker({ lat: lat, lng: lng, label: '📍', color: '#E2574C', group: 'search' });
            _handle.flyTo({ lat: lat, lng: lng, zoom: 17 });
          } catch (e) { console.warn('tripmap: flyTo failed', e); }
        });
        results.appendChild(btn);
      });
      results.style.display = '';
    }

    input.addEventListener('input', function () {
      clearTimeout(_searchTimer);
      var q = input.value.trim();
      if (q.length < 2) { hide(); return; }
      _searchTimer = setTimeout(function () {       // debounce — מכבד את תנאי השימוש של Nominatim
        searchPlaces(q).then(function (list) {
          if (document.contains(results)) show(list || []);
        }).catch(function (e) {
          if (e && e.name === 'AbortError') return;
          if (document.contains(results)) show([]);
        });
      }, 400);
    });
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape') { hide(); e.stopPropagation(); } });
    _onDocClick = function (e) { if (!wrap.contains(e.target)) hide(); };
    document.addEventListener('click', _onDocClick);
    return wrap;
  }

  // ── סרגל הכלים הצף ──
  function buildToolbar() {
    var btn2d = el('button', { class: 'tm-btn active', title: 'תצוגה שטוחה' }, '2D');
    var btn3d = el('button', { class: 'tm-btn', title: 'תלת־מימד: הטיה, גבהים ומבנים' }, '3D');
    var btnStreets = el('button', { class: 'tm-btn active', title: 'מפת רחובות' }, '🗺️ רחובות');
    var btnSat = el('button', { class: 'tm-btn', title: 'תצלום לוויין' }, '🛰️ לוויין');
    var btnStreet = el('button', { class: 'tm-btn', title: 'תצוגת רחוב: הפעל ולחץ על המפה' }, '🚶');
    var btnHelp = el('button', { class: 'tm-btn', title: 'עזרה' }, '❓');

    function setActive(on, off) { on.classList.add('active'); off.classList.remove('active'); }

    btn2d.addEventListener('click', function () {
      if (!_handle) return;
      try { _handle.setMode('2d'); setActive(btn2d, btn3d); } catch (e) { console.warn(e); }
    });
    btn3d.addEventListener('click', function () {
      if (!_handle) return;
      try { _handle.setMode('3d'); setActive(btn3d, btn2d); } catch (e) { console.warn(e); }
    });
    btnStreets.addEventListener('click', function () {
      if (!_handle) return;
      try { _handle.setBasemap('streets'); setActive(btnStreets, btnSat); } catch (e) { console.warn(e); }
    });
    btnSat.addEventListener('click', function () {
      if (!_handle) return;
      try { _handle.setBasemap('satellite'); setActive(btnSat, btnStreets); } catch (e) { console.warn(e); }
    });

    // 🚶 מצב "פקק": קליק על המפה פותח תצוגת רחוב שם (TripMapStreet — סוכן B)
    btnStreet.addEventListener('click', function () {
      if (!_handle) return;
      if (!window.TripMapStreet || !TripMapStreet.enableDropMode) {
        App.toast('תצוגת הרחוב עוד לא נטענה'); return;
      }
      if (_streetOn) {
        try { TripMapStreet.disableDropMode(_handle); } catch (e) {}
        _streetOn = false; btnStreet.classList.remove('active');
      } else {
        try {
          TripMapStreet.enableDropMode(_handle, function () {
            _streetOn = false; btnStreet.classList.remove('active');
          });
          _streetOn = true; btnStreet.classList.add('active');
          App.toast('🚶 לחץ על נקודה במפה לפתיחת תצוגת רחוב');
        } catch (e) { console.warn('tripmap: street mode failed', e); }
      }
    });

    btnHelp.addEventListener('click', function () {
      var body = el('div', { class: 'tm-help-body' });
      body.appendChild(el('p', {}, 'מפת ישראל אינטראקטיבית: עברו בין 2D/3D ובין רחובות/לוויין, חפשו מקום, לחצו 🚶 ואז על המפה לתצוגת רחוב, ונהלו טיולים בפאנל "הטיולים שלי".'));
      var extra = (window.TripMapControls && TripMapControls.helpHTML) ? TripMapControls.helpHTML : '';
      if (extra) body.appendChild(el('div', { class: 'tm-help-controls', html: extra }));
      else body.appendChild(el('p', { class: 'tm-help-muted' }, 'במצב 3D ניתן לנווט בגוף-ראשון (חצים/WASD, גרירת עכבר למבט, גלגלת לגובה).'));
      openModal('❓ עזרה — מפת טיולים', body);
    });

    return el('div', { class: 'tm-toolbar' }, [
      el('div', { class: 'tm-btn-group' }, [btn2d, btn3d]),
      el('div', { class: 'tm-btn-group' }, [btnStreets, btnSat]),
      el('div', { class: 'tm-btn-group' }, [btnStreet, btnHelp]),
      buildSearch()
    ]);
  }

  // ── הודעת כשל ידידותית במקום המפה ──
  function failBox(msg) {
    return el('div', { class: 'tm-fail' }, [
      el('div', { class: 'tm-fail-icon' }, '🗺️'),
      el('div', { class: 'tm-fail-msg' }, msg)
    ]);
  }

  function renderView(root) {
    cleanup();               // אם חוזרים ל-view בלי שהניקוי רץ — לנקות קודם
    _root = root;

    var mapEl = el('div', { class: 'tm-map' });
    var sideEl = el('div', { class: 'tm-side' });
    var loading = el('div', { class: 'tm-loading' }, [
      el('div', { class: 'tm-spinner' }), el('div', {}, 'טוען את המפה…')
    ]);
    var wrap = el('div', { class: 'tm-view' }, [mapEl, loading]);
    root.appendChild(wrap);
    watchLifecycle(wrap);

    // עמידות: המנוע (סוכן A) נכתב במקביל — אם חסר, לא קורסים.
    if (!window.TripMapEngine || !TripMapEngine.ensureLib) {
      loading.remove();
      wrap.appendChild(failBox('מנוע המפה עדיין לא זמין. נסה לרענן את הדף — ואם זה נמשך, ייתכן שהמודול בבנייה.'));
      return;
    }

    TripMapEngine.ensureLib()
      .then(function () { return TripMapEngine.create(mapEl); })
      .then(function (handle) {
        if (!document.contains(wrap)) { try { handle.destroy(); } catch (e) {} return; }
        _handle = handle;
        loading.remove();
        wrap.appendChild(buildToolbar());
        wrap.appendChild(sideEl);

        // ניווט גוף-ראשון (סוכן B) — תלות רכה
        if (window.TripMapControls && TripMapControls.attach) {
          try { TripMapControls.attach(handle); } catch (e) { console.warn('tripmap: controls attach failed', e); }
        }
        // שכבת הטיולים (קובץ-אח) — תלות רכה
        if (window.TripLayer && TripLayer.mount) {
          try { TripLayer.mount(handle, sideEl); } catch (e) { console.warn('tripmap: trip layer failed', e); }
        } else {
          sideEl.appendChild(el('div', { class: 'tm-side-missing card' }, 'שכבת הטיולים לא נטענה.'));
        }

        _onWinResize = function () { if (_handle) { try { _handle.resize(); } catch (e) {} } };
        window.addEventListener('resize', _onWinResize);
        try { handle.resize(); } catch (e) {}
      })
      .catch(function (err) {
        console.warn('tripmap init failed:', err);
        loading.remove();
        if (document.contains(wrap)) {
          wrap.appendChild(failBox('לא הצלחנו לטעון את המפה. נדרש חיבור אינטרנט למפה — בדוק את הרשת ונסה שוב.'));
        }
      });
  }

  if (window.App && App.register) App.register('tripmap', renderView);
})();
