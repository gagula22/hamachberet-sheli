(function () {
  'use strict';
  // ─────────────────────────────────────────────────────────────────────────
  // שכבת הטיולים — window.TripLayer (סוכן C).
  // פאנל צד "הטיולים שלי": יצירה/מחיקה/עריכת ימים ועצירות, הצגת טיול על
  // המפה (צבע לכל יום, markers ממוספרים, קווי מסלול, chips של ימים),
  // "תכנן טיול עם Claude" (העתקת פרומפט מוכן) וייבוא JSON מהסקיל.
  // נתונים: Store key 'trips' (מערך; הסכמה המדויקת ב-CONTRACT.md):
  //   { id, title, region, createdAt,
  //     days: [ { n, title, stops: [ { name, lat, lng, time?, note?, type? } ] } ] }
  // משתמש אך ורק ב-API הציבורי של handle (CONTRACT.md, ממשק A).
  // ─────────────────────────────────────────────────────────────────────────

  function el(t, a, k) { return App.el(t, a || {}, k || []); }

  // צבע קבוע לכל יום (צבעי מפה אמיתיים — לא טוקני theme, כדי שיהיו ברורים
  // גם על לוויין וגם במצב כהה)
  var DAY_COLORS = ['#E2574C', '#3B7DD8', '#2D8C4F', '#B8762A', '#7B5BD6', '#C2417F', '#1F8A8A', '#6D8C1F'];
  function dayColor(i) { return DAY_COLORS[i % DAY_COLORS.length]; }

  // ── מצב חי של השכבה ──
  var _handle = null;
  var _sideEl = null;
  var _activeTripId = null;
  var _activeDayN = null;     // יום שמחכה לקליק-על-המפה ("הוסף עצירה")
  var _clickOff = null;       // פונקציית ההסרה של onClickMap
  var _unsubStore = null;
  var _collapsed = false;
  var _pop = null;            // בועת המידע של עצירה

  function trips() { return Store.get('trips') || []; }
  function save(arr) { Store.set('trips', arr); }
  function activeTrip() {
    var id = _activeTripId;
    return trips().find(function (t) { return t.id === id; }) || null;
  }

  // עדכון טיול אחד במערך (אי-שינוי-במקום — כמו שאר ה-views)
  function patchTrip(id, fn) {
    save(trips().map(function (t) { return t.id === id ? fn(JSON.parse(JSON.stringify(t))) : t; }));
  }

  // ── ציור טיול על המפה ─────────────────────────────────────────────────
  function clearMap() {
    if (!_handle) return;
    try { _handle.clearMarkers('trip'); } catch (e) {}
    try { _handle.clearRoutes('trip'); } catch (e) {}
    closePop();
  }

  var _drawToken = 0;          // מבטל ציורי-מסלול אסינכרוניים ישנים בהחלפת טיול
  var _dayRoutes = {};         // n היום → { routes:[…], active, color } (מסלול ראשי+חלופות)
  var START_COLOR = '#2e9e5b', END_COLOR = '#d9442e';

  function showTripOnMap(trip) {
    clearMap();
    _dayRoutes = {};
    if (!_handle || !trip) return;
    var token = ++_drawToken;
    var allPts = [];
    var days = trip.days || [];
    var lastDayIdx = days.length - 1;

    // נקודת מוצא (עיר מגורים) → סיכת "התחלה" + תחילת המסלול של יום 1
    var originPt = (trip.origin && isFinite(trip.origin.lat) && isFinite(trip.origin.lng))
      ? { lat: trip.origin.lat, lng: trip.origin.lng, name: trip.origin.name } : null;
    if (originPt) {
      try {
        _handle.addMarker({
          lat: originPt.lat, lng: originPt.lng, id: 'tm-start',
          badge: '🚩', color: START_COLOR, pinKind: 'start', group: 'trip',
          label: 'התחלה · ' + (originPt.name || 'עיר מוצא'),
          onClick: function () { openInfoPop('🚩 התחלה', originPt.name || 'נקודת המוצא של הטיול'); }
        });
      } catch (e) {}
      allPts.push([originPt.lng, originPt.lat]);
    }

    days.forEach(function (day, i) {
      var color = dayColor(i);
      var coords = [];
      var stops = (day.stops || []).filter(function (s) { return isFinite(s.lat) && isFinite(s.lng); });
      stops.forEach(function (stop, j) {
        var isLastOfDay = (j === stops.length - 1);
        var isTripEnd = isLastOfDay && (i === lastDayIdx);
        try {
          _handle.addMarker({
            lat: stop.lat, lng: stop.lng,
            badge: isTripEnd ? '🏁' : String(j + 1),
            color: isTripEnd ? END_COLOR : color,
            pinKind: isTripEnd ? 'end' : 'stop', group: 'trip',
            label: stop.name,
            onClick: function () { openStopPop(stop, day, i, isLastOfDay, isTripEnd); }
          });
        } catch (e) { console.warn('triplayer: marker failed', e); }
        coords.push([stop.lng, stop.lat]);
        allPts.push([stop.lng, stop.lat]);
      });
      // יום 1: המסלול מתחיל מעיר המוצא (אם יש)
      var routeCoords = coords.slice();
      if (i === 0 && originPt) routeCoords.unshift([originPt.lng, originPt.lat]);
      if (routeCoords.length > 1) drawDayRoute(day, routeCoords, color, token);
    });

    // מיקוד המפה על כל הנקודות (כולל ההתחלה) — לא מבט-על של כל הארץ
    if (allPts.length) {
      try { _handle.fitBounds(allPts, { maxZoom: 13 }); } catch (e) {}
    }
  }

  // מצייר את המסלול הפעיל של היום (לפי כבישים). שומר את כל החלופות לכפתור-המעבר.
  // נכשל (רשת/שרת) → קו אווירי ישר מקווקו.
  function drawDayRoute(day, coords, color, token) {
    var straight = function () {
      if (token !== _drawToken) return;
      try { _handle.drawRoute(coords, { id: 'rt-d' + day.n, color: color, group: 'trip', dash: [1.5, 1.2], opacity: 0.7 }); }
      catch (e) { console.warn('triplayer: route failed', e); }
    };
    if (!window.TripRouting || !TripRouting.route) { straight(); return; }
    TripRouting.route(coords).then(function (res) {
      if (token !== _drawToken) return;                 // טיול אחר כבר מצויר
      if (!res || !res.ok || !res.routes.length) { straight(); return; }
      _dayRoutes[day.n] = { routes: res.routes, active: 0, color: color };
      drawActiveRoute(day.n);                            // רק המסלול הפעיל — לא הכול יחד
    }).catch(function () { straight(); });
  }

  // מצייר רק את המסלול הפעיל של היום (אותו id → מחליף את הקודם)
  function drawActiveRoute(n) {
    var info = _dayRoutes[n];
    if (!info || !_handle) return;
    var r = info.routes[info.active];
    if (!r) return;
    try { _handle.drawRoute(r.coords, { id: 'rt-d' + n, color: info.color, group: 'trip' }); } catch (e) {}
  }

  // החלפה למסלול הבא (כפתור "מסלול חלופי") — מציג אחד בלבד בכל רגע
  function cycleRoute(day) {
    var info = _dayRoutes[day.n];
    if (!info || info.routes.length < 2) return;
    info.active = (info.active + 1) % info.routes.length;
    drawActiveRoute(day.n);
    try { _handle.fitBounds(info.routes[info.active].coords, { maxZoom: 14 }); } catch (e) {}
    showRouteInfo(day);
  }

  // מיקוד המפה על עצירות היום (fitBounds) + סיכום מסלול אם כבר חושב
  function flyToDay(day) {
    var pts = (day.stops || [])
      .filter(function (s) { return isFinite(s.lat) && isFinite(s.lng); })
      .map(function (s) { return [s.lng, s.lat]; });
    if (!pts.length || !_handle) return;
    try { _handle.fitBounds(pts, { maxZoom: 14 }); } catch (e) {}
    showRouteInfo(day);
  }

  // בועת סיכום מסלול ליום: מרחק/זמן/כבישים של המסלול הפעיל + כפתור החלפה לחלופי
  function showRouteInfo(day) {
    closePop();
    var info = _dayRoutes[day.n];
    if (!info || !info.routes.length) return;
    var host = _sideEl && _sideEl.closest('.tm-view');
    if (!host) return;
    var dh = (window.TripRouting && TripRouting.durHuman) ? TripRouting.durHuman : function (m) { return m + ' דק\''; };
    var n = info.routes.length, idx = info.active, r = info.routes[idx];
    var which = (n > 1) ? (idx === 0 ? 'מסלול ראשי' : 'מסלול חלופי ' + idx) + ' (' + (idx + 1) + '/' + n + ')' : 'מסלול נסיעה';
    var rows = [
      el('div', { class: 'tm-route-main' }, '🚗 ' + r.distanceKm + ' ק"מ · ' + dh(r.durationMin) +
        (r.roads && r.roads.length ? ' · כבישים ' + r.roads.slice(0, 6).join(', ') : ''))
    ];
    var headKids = [
      el('span', {}, 'יום ' + (day.n != null ? day.n : '?') + ' — ' + which),
      el('button', { class: 'tm-stop-pop-close', title: 'סגירה', onClick: closePop }, '✕')
    ];
    _pop = el('div', { class: 'tm-route-info' }, [el('div', { class: 'tm-route-info-head' }, headKids)].concat(rows));
    if (n > 1) {
      var btn = el('button', { class: 'tm-route-alt-btn' }, '🔀 הצג מסלול חלופי (' + (n) + ' אפשרויות)');
      btn.addEventListener('click', function () { cycleRoute(day); });
      _pop.appendChild(btn);
    }
    host.appendChild(_pop);
  }

  // בועת מידע כללית (להתחלה/סוף)
  function openInfoPop(title, body) {
    closePop();
    var host = _sideEl && _sideEl.closest('.tm-view');
    if (!host) return;
    _pop = el('div', { class: 'tm-stop-pop' }, [
      el('div', { class: 'tm-stop-pop-body' }, [
        el('div', { class: 'tm-stop-pop-name' }, title),
        el('div', { class: 'tm-stop-pop-meta' }, body || '')
      ]),
      el('button', { class: 'tm-stop-pop-close', title: 'סגירה', onClick: closePop }, '✕')
    ]);
    host.appendChild(_pop);
  }

  // ── בועת מידע לעצירה (תחליף popup — אין popup ב-API של המנוע) ──
  function closePop() { if (_pop) { _pop.remove(); _pop = null; } }
  function openStopPop(stop, day, dayIdx, isDayEnd, isTripEnd) {
    closePop();
    var host = _sideEl && _sideEl.closest('.tm-view');
    if (!host) return;
    var meta = [];
    if (stop.time) meta.push('🕐 ' + stop.time);
    if (stop.type) meta.push(stop.type);
    // סימון סוף יום / סוף הטיול
    var tag = isTripEnd ? '🏁 סוף הטיול'
            : (isDayEnd ? '🏁 סוף יום ' + (day && day.n != null ? day.n : '?') : null);
    _pop = el('div', { class: 'tm-stop-pop' }, [
      el('span', { class: 'tm-stop-pop-dot', style: { background: isTripEnd ? END_COLOR : dayColor(dayIdx || 0) } }),
      el('div', { class: 'tm-stop-pop-body' }, [
        el('div', { class: 'tm-stop-pop-name' }, (stop.name || 'עצירה') + (tag ? '  ·  ' + tag : '')),
        el('div', { class: 'tm-stop-pop-meta' }, [
          'יום ' + (day && day.n != null ? day.n : '?'),
          meta.length ? ' · ' + meta.join(' · ') : '',
          stop.note ? ' — ' + stop.note : ''
        ].join(''))
      ]),
      el('button', { class: 'tm-stop-pop-close', title: 'סגירה', onClick: closePop }, '✕')
    ]);
    host.appendChild(_pop);
  }

  // ── מודאל לפי מוסכמת הכלים (✕ / ESC / קליק רקע) ──
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

  // ── מתכנן הטיולים העצמאי (אשף מקומי — אפס תלות ב-LLM) ──
  // נפתח דרך window.TripPlannerUI (סוכן F). onSave מקבל את הטיול והמסמך
  // שחולל המנוע, שומר ל-Store, ומציג על המפה (אם יש עצירות עם קואורדינטות).
  function openPlanner() {
    if (!window.TripPlannerUI || typeof TripPlannerUI.open !== 'function') {
      App.toast('מתכנן הטיולים עדיין נטען — נסו שוב בעוד רגע'); return;
    }
    TripPlannerUI.open({
      onSave: function (trip, doc) {
        if (!trip || typeof trip !== 'object') return;
        if (!trip.id) trip.id = Store.uid();
        if (!trip.createdAt) trip.createdAt = Date.now();
        if (!Array.isArray(trip.days)) trip.days = [];
        if (doc && !trip.doc) trip.doc = doc;          // המסמך נשמר בתוך הטיול
        save(trips().concat([trip]));
        _activeTripId = trip.id;
        renderPanel();
        // טיול בארץ → עצירות עם קואורדינטות → הצגה על המפה. חו"ל → רק מסמך.
        var hasStops = trip.days.some(function (d) { return d.stops && d.stops.length; });
        if (hasStops) {
          showTripOnMap(trip);
          var d0 = trip.days.find(function (d) { return d.stops && d.stops.length; });
          if (d0) flyToDay(d0);
          App.toast('🧳 "' + trip.title + '" נשמר והוצג על המפה');
        } else {
          App.toast('🧳 "' + trip.title + '" נשמר — פתחו אותו לצפייה בתוכנית');
        }
      }
    });
  }

  // ── ולידציה של JSON מיובא ────────────────────────────────────────────
  // מחזיר { trip, warnings } או זורק Error עם הודעה בעברית.
  function validateTripJSON(raw) {
    var obj;
    try { obj = JSON.parse(raw); } catch (e) { throw new Error('זה לא JSON תקין — בדקו שהעתקתם את כל הבלוק.'); }
    if (Array.isArray(obj)) obj = obj[0];                 // הודבק מערך — ניקח את הראשון
    if (obj && obj.trip && typeof obj.trip === 'object') obj = obj.trip;  // עטיפה נפוצה
    if (!obj || typeof obj !== 'object') throw new Error('מבנה לא מוכר — מצופה אובייקט טיול.');
    if (!Array.isArray(obj.days) || !obj.days.length) throw new Error('חסר מערך "days" עם לפחות יום אחד.');

    var warnings = [];
    var days = obj.days.map(function (d, i) {
      if (!d || typeof d !== 'object') throw new Error('יום ' + (i + 1) + ' אינו אובייקט תקין.');
      if (!Array.isArray(d.stops)) throw new Error('ביום ' + (i + 1) + ' חסר מערך "stops".');
      var stops = d.stops.map(function (s, j) {
        if (!s || typeof s !== 'object' || typeof s.name !== 'string' || !s.name.trim()) {
          throw new Error('עצירה ' + (j + 1) + ' ביום ' + (i + 1) + ' חסרת שם.');
        }
        var lat = Number(s.lat), lng = Number(s.lng);
        if (!isFinite(lat) || !isFinite(lng)) {
          throw new Error('לעצירה "' + s.name + '" (יום ' + (i + 1) + ') חסרות קואורדינטות lat/lng מספריות.');
        }
        // טווחי ישראל — אזהרה רכה בלבד (לא חוסם)
        if (lat < 29 || lat > 34 || lng < 34 || lng > 36) {
          warnings.push('"' + s.name + '" נראית מחוץ לגבולות ישראל (' + lat.toFixed(3) + ', ' + lng.toFixed(3) + ')');
        }
        var out = { name: s.name.trim(), lat: lat, lng: lng };
        if (s.time) out.time = String(s.time);
        if (s.note) out.note = String(s.note);
        if (s.type) out.type = String(s.type);
        return out;
      });
      return { n: (typeof d.n === 'number' ? d.n : i + 1), title: (typeof d.title === 'string' ? d.title : 'יום ' + (i + 1)), stops: stops };
    });

    return {
      trip: {
        id: Store.uid(),
        title: (typeof obj.title === 'string' && obj.title.trim()) ? obj.title.trim() : 'טיול ללא שם',
        region: (typeof obj.region === 'string') ? obj.region : '',
        createdAt: Date.now(),
        days: days
      },
      warnings: warnings
    };
  }

  function openImportModal() {
    var ta = el('textarea', { class: 'tm-import-ta', placeholder: 'הדביקו כאן את ה-JSON שהחזיר Claude…', rows: '10' });
    var msg = el('div', { class: 'tm-import-msg' });
    var body = el('div', {}, [
      el('p', {}, 'הדביקו את בלוק ה-JSON (בלי גרשי ה-``` מסביב). הטיול יישמר ויוצג מיד על המפה.'),
      ta, msg
    ]);
    var importBtn = el('button', { class: 'tm-primary-btn' }, '⬇️ ייבא והצג על המפה');
    var modal;
    importBtn.addEventListener('click', function () {
      msg.textContent = ''; msg.className = 'tm-import-msg';
      var raw = ta.value.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
      if (!raw) { msg.textContent = 'הדביקו JSON קודם.'; msg.classList.add('err'); return; }
      var res;
      try { res = validateTripJSON(raw); }
      catch (e) { msg.textContent = '⚠️ ' + e.message; msg.classList.add('err'); return; }
      save(trips().concat([res.trip]));
      _activeTripId = res.trip.id;
      renderPanel();
      showTripOnMap(res.trip);
      var d0 = res.trip.days[0];
      if (d0 && d0.stops.length) flyToDay(d0);
      App.toast('🧳 "' + res.trip.title + '" יובא והוצג על המפה');
      if (res.warnings.length) {
        App.toast('⚠️ ' + res.warnings.length + ' עצירות נראות מחוץ לישראל — בדקו את הקואורדינטות');
      }
      if (modal) modal.close();
    });
    body.appendChild(el('div', { class: 'tm-modal-actions' }, [importBtn]));
    modal = openModal('📋 ייבוא תוכנית (JSON)', body);
  }

  // ── הוספת עצירה מקליק על המפה ──
  function disarmAddStop() {
    _activeDayN = null;
    if (_clickOff) { try { _clickOff(); } catch (e) {} _clickOff = null; }
  }

  function armAddStop(tripId, dayN, nameInput) {
    disarmAddStop();
    if (!_handle || typeof _handle.onClickMap !== 'function') {
      App.toast('המפה עדיין לא מוכנה'); return;
    }
    _activeDayN = dayN;
    var off = _handle.onClickMap(function (pos) {
      if (!pos || !isFinite(pos.lat) || !isFinite(pos.lng)) return;
      var name = (nameInput && nameInput.value.trim()) || '';
      patchTrip(tripId, function (t) {
        var day = (t.days || []).find(function (d) { return d.n === dayN; });
        if (day) {
          day.stops = day.stops || [];
          day.stops.push({ name: name || ('עצירה ' + (day.stops.length + 1)), lat: +pos.lat.toFixed(6), lng: +pos.lng.toFixed(6) });
        }
        return t;
      });
      if (nameInput) nameInput.value = '';
      disarmAddStop();
      renderPanel();
      showTripOnMap(activeTrip());
      App.toast('📍 העצירה נוספה');
    });
    _clickOff = (typeof off === 'function') ? off : null;
    App.toast('📍 לחצו על המפה במיקום העצירה');
    renderPanel();
  }

  // ── רינדור הפאנל ─────────────────────────────────────────────────────
  function renderPanel() {
    if (!_sideEl || !document.contains(_sideEl)) return;
    _sideEl.innerHTML = '';
    var panel = el('div', { class: 'tm-panel' + (_collapsed ? ' collapsed' : '') });

    // כותרת + קיפול
    var head = el('button', { class: 'tm-panel-head', title: _collapsed ? 'פתיחת הפאנל' : 'קיפול הפאנל' }, [
      el('span', {}, '🧳 הטיולים שלי'),
      el('span', { class: 'tm-panel-fold' }, _collapsed ? '▲' : '▼')
    ]);
    head.addEventListener('click', function () { _collapsed = !_collapsed; renderPanel(); });
    panel.appendChild(head);

    if (!_collapsed) {
      var body = el('div', { class: 'tm-panel-body' });

      // פעולות עליונות
      body.appendChild(el('div', { class: 'tm-actions' }, [
        el('button', { class: 'tm-action-btn primary', onClick: openPlanner }, '✨ תכנן טיול חדש'),
        el('button', { class: 'tm-action-btn', onClick: openImportModal }, '📋 ייבוא תוכנית (JSON)')
      ]));

      // יצירה ידנית: שם + אזור
      var nameIn = el('input', { class: 'tm-input', type: 'text', placeholder: 'שם הטיול' });
      var regionIn = el('input', { class: 'tm-input', type: 'text', placeholder: 'אזור' });
      function addTrip() {
        var name = nameIn.value.trim();
        if (!name) { App.toast('תנו שם לטיול קודם'); return; }
        var t = { id: Store.uid(), title: name, region: regionIn.value.trim(), createdAt: Date.now(), days: [{ n: 1, title: 'יום 1', stops: [] }] };
        save(trips().concat([t]));
        nameIn.value = regionIn.value = '';
        _activeTripId = t.id;
        renderPanel(); clearMap();
        App.toast('🧳 הטיול נוצר — הוסיפו עצירות');
      }
      [nameIn, regionIn].forEach(function (i) { i.addEventListener('keydown', function (e) { if (e.key === 'Enter') addTrip(); }); });
      body.appendChild(el('div', { class: 'tm-new-row' }, [nameIn, regionIn, el('button', { class: 'tm-add-btn', onClick: addTrip }, '+')]));

      // רשימת הטיולים
      var list = trips().slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
      if (!list.length) {
        body.appendChild(el('div', { class: 'tm-empty' }, 'עוד אין טיולים. לחצו "✨ תכנן טיול חדש" וקבלו תוכנית מלאה תוך שניות.'));
      }
      list.forEach(function (t) {
        var isActive = t.id === _activeTripId;
        var row = el('div', { class: 'tm-trip' + (isActive ? ' active' : '') });
        var open = el('button', { class: 'tm-trip-main' }, [
          el('span', { class: 'tm-trip-title' }, t.title || 'טיול'),
          el('span', { class: 'tm-trip-meta' }, [(t.region || ''), (t.days || []).length + ' ימים'].filter(Boolean).join(' · '))
        ]);
        open.addEventListener('click', function () {
          if (isActive) { _activeTripId = null; clearMap(); }
          else {
            _activeTripId = t.id;
            showTripOnMap(t);
            var d0 = (t.days || [])[0];
            if (d0 && (d0.stops || []).length) flyToDay(d0);
          }
          disarmAddStop();
          renderPanel();
        });
        row.appendChild(open);
        // טיול שחולל ע"י המתכנן מחזיק תוכנית מלאה (doc) — כפתור לפתיחתה
        if (t.doc && window.TripPlannerUI && TripPlannerUI.showDoc) {
          var docBtn = el('button', { class: 'tm-trip-doc', title: 'צפייה בתוכנית המלאה' }, '📄');
          docBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            try { TripPlannerUI.showDoc(t.doc); } catch (err) { App.toast('שגיאה בפתיחת התוכנית'); }
          });
          row.appendChild(docBtn);
        }
        var del = el('button', { class: 'tm-trip-del', title: 'מחיקת הטיול' }, '✕');
        del.addEventListener('click', function (e) {
          e.stopPropagation();
          if (!confirm('למחוק את "' + (t.title || 'הטיול') + '"? אי אפשר לבטל.')) return;
          save(trips().filter(function (x) { return x.id !== t.id; }));
          if (_activeTripId === t.id) { _activeTripId = null; clearMap(); }
          disarmAddStop();
          renderPanel();
          App.toast('הטיול נמחק');
        });
        row.appendChild(del);
        body.appendChild(row);

        if (isActive) body.appendChild(renderTripEditor(t));
      });

      panel.appendChild(body);
    }
    _sideEl.appendChild(panel);
  }

  // עורך הטיול הפעיל: chips של ימים + עצירות + הוספה
  function renderTripEditor(trip) {
    var box = el('div', { class: 'tm-trip-editor' });

    // chips של ימים — קליק מקיף את עצירות היום
    var chips = el('div', { class: 'tm-day-chips' });
    (trip.days || []).forEach(function (day, i) {
      var chip = el('button', { class: 'tm-day-chip', style: { borderColor: dayColor(i) }, title: day.title || '' }, [
        el('span', { class: 'tm-day-dot', style: { background: dayColor(i) } }),
        'יום ' + day.n
      ]);
      chip.addEventListener('click', function () { flyToDay(day); });
      chips.appendChild(chip);
    });
    var addDay = el('button', { class: 'tm-day-chip tm-day-add', title: 'הוספת יום' }, '+ יום');
    addDay.addEventListener('click', function () {
      patchTrip(trip.id, function (t) {
        var n = (t.days || []).reduce(function (m, d) { return Math.max(m, d.n || 0); }, 0) + 1;
        t.days = (t.days || []).concat([{ n: n, title: 'יום ' + n, stops: [] }]);
        return t;
      });
      renderPanel(); showTripOnMap(activeTrip());
    });
    chips.appendChild(addDay);
    box.appendChild(chips);

    // ימים ועצירות
    (trip.days || []).forEach(function (day, i) {
      var dBox = el('div', { class: 'tm-day' });
      dBox.appendChild(el('div', { class: 'tm-day-head' }, [
        el('span', { class: 'tm-day-dot', style: { background: dayColor(i) } }),
        el('span', { class: 'tm-day-title' }, 'יום ' + day.n + (day.title && day.title !== 'יום ' + day.n ? ' · ' + day.title : ''))
      ]));

      (day.stops || []).forEach(function (stop, j) {
        var srow = el('div', { class: 'tm-stop' });
        var go = el('button', { class: 'tm-stop-main', title: 'מעבר לעצירה על המפה' }, [
          el('span', { class: 'tm-stop-num', style: { background: dayColor(i) } }, String(j + 1)),
          el('span', { class: 'tm-stop-name' }, stop.name),
          stop.time ? el('span', { class: 'tm-stop-time' }, stop.time) : null
        ]);
        go.addEventListener('click', function () {
          if (!_handle) return;
          try { _handle.flyTo({ lat: stop.lat, lng: stop.lng, zoom: 16 }); } catch (e) {}
          openStopPop(stop, day, i);
        });
        var sdel = el('button', { class: 'tm-stop-del', title: 'הסרת העצירה' }, '✕');
        sdel.addEventListener('click', function () {
          patchTrip(trip.id, function (t) {
            var d = (t.days || []).find(function (x) { return x.n === day.n; });
            if (d) d.stops.splice(j, 1);
            return t;
          });
          renderPanel(); showTripOnMap(activeTrip());
        });
        srow.appendChild(go); srow.appendChild(sdel);
        dBox.appendChild(srow);
      });

      // הוספת עצירה: שם + קליק על המפה (או דרך החיפוש בסרגל ואז קליק)
      var stopName = el('input', { class: 'tm-input tm-stop-input', type: 'text', placeholder: 'שם העצירה' });
      var arming = _activeDayN === day.n;
      var mapBtn = el('button', { class: 'tm-map-pick' + (arming ? ' arming' : ''), title: 'בחירת מיקום בלחיצה על המפה' },
        arming ? '👆 לחצו על המפה…' : '📍 מהמפה');
      mapBtn.addEventListener('click', function () {
        if (arming) { disarmAddStop(); renderPanel(); }
        else armAddStop(trip.id, day.n, stopName);
      });
      dBox.appendChild(el('div', { class: 'tm-stop-add' }, [stopName, mapBtn]));

      box.appendChild(dBox);
    });

    return box;
  }

  // ── API ציבורי ───────────────────────────────────────────────────────
  window.TripLayer = {
    // handle = ה-handle של TripMapEngine; sidePanelEl = מיכל הפאנל מה-view
    mount: function (handle, sidePanelEl) {
      this.unmount();
      _handle = handle;
      _sideEl = sidePanelEl;
      _collapsed = window.innerWidth <= 700;   // במובייל מתחילים מקופל
      renderPanel();
      var t = activeTrip();
      if (t) showTripOnMap(t);
      // סנכרון מהענן / ממכשיר אחר → רינדור מחדש; מתנתק לבד כשה-view הוחלף
      _unsubStore = Store.subscribe(function () {
        if (!_sideEl || !document.contains(_sideEl)) { window.TripLayer.unmount(); return; }
        renderPanel();
        var a = activeTrip();
        if (a) showTripOnMap(a); else clearMap();
      });
    },
    unmount: function () {
      disarmAddStop();
      closePop();
      if (_unsubStore) { try { _unsubStore(); } catch (e) {} _unsubStore = null; }
      clearMap();
      _handle = null; _sideEl = null;
    }
  };
})();
