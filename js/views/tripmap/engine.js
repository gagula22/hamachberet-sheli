(function () {
  'use strict';
  // ── tripmap/engine.js — מנוע המפה (MapLibre GL) → window.TripMapEngine ─────────
  // אחריות: טעינת הספרייה, יצירת מפה, מצבי 2d/3d (terrain+שמיים+מבנים), החלפת
  // basemap, markers/routes עם קבוצות, והאזנת קליק. כתובות ספקים — רק ב-config.js.
  //
  // עיקרון מפתח: style **אחד** עם כל המקורות והשכבות מראש; החלפת לוויין/רחובות
  // נעשית ב-layout visibility בלבד (לא setStyle מלא) — כך מצב 3d, markers ו-routes
  // שורדים כל החלפה בלי שחזור ידני.

  // ───────────────────────── טעינת הספרייה (פעם אחת) ─────────────────────────
  var _libP = null;

  function _base() {
    // בסיס יחסי לאתר (עובד גם ב-GitHub Pages תחת תת-נתיב) — כמו PdfOps.ensureLib
    return location.href.replace(/#.*/, '').replace(/index\.html.*/, '');
  }

  function _loadCss(href, fallbackHref) {
    // כשל CSS לא מפיל את המפה — רק עיצוב controls/popups; מנסים מקומי ואז CDN
    var l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href;
    l.onerror = function () {
      l.remove();
      if (!fallbackHref) return;
      var c = document.createElement('link');
      c.rel = 'stylesheet'; c.href = fallbackHref;
      document.head.appendChild(c);
    };
    document.head.appendChild(l);
  }

  function _loadScript(src, onOk, onFail) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = onOk;
    s.onerror = function () { s.remove(); onFail(); };
    document.head.appendChild(s);
  }

  function ensureLib() {
    if (window.maplibregl) return Promise.resolve(window.maplibregl);
    if (_libP) return _libP;
    var C = window.TripMapConfig;
    if (!C) return Promise.reject(new Error('TripMapConfig חסר — ודא ש-config.js נטען לפני engine.js'));
    _libP = new Promise(function (res, rej) {
      var base = _base();
      _loadCss(base + C.lib.vendorCss, C.lib.cdnCss);
      var done = function () {
        if (!window.maplibregl) return fail();
        // תוסף RTL — חובה לתוויות עברית (אחרת סדר האותיות מתהפך). lazy=true:
        // maplibre מוריד אותו רק כשנתקל בתווית RTL ראשונה. נרשם פעם אחת בלבד.
        try {
          if (typeof maplibregl.setRTLTextPlugin === 'function' &&
              (typeof maplibregl.getRTLTextPluginStatus !== 'function' ||
               maplibregl.getRTLTextPluginStatus() === 'unavailable')) {
            maplibregl.setRTLTextPlugin(_base() + C.lib.vendorRtl, true);
          }
        } catch (e) { console.debug('tripmap rtl-plugin:', e); }
        res(window.maplibregl);
      };
      var fail = function () {
        _libP = null;  // מאפשר ניסיון חוזר כשהרשת תחזור
        rej(new Error('לא ניתן לטעון את ספריית המפה — נדרש חיבור אינטרנט למפה'));
      };
      // קודם העותק המקומי המאורז; אם חסר/נכשל — fallback ל-CDN; אחרת כשל עדין
      _loadScript(base + C.lib.vendorJs, done, function () {
        _loadScript(C.lib.cdnJs, done, fail);
      });
    });
    return _libP;
  }

  // ───────────────────────── בניית ה-style ההתחלתי ─────────────────────────
  // שמות פנימיים קבועים של מקורות/שכבות (פרטי מימוש — לא חלק מהחוזה)
  var SRC = { sat: 'tm-sat', osm: 'tm-osm', dem: 'tm-dem', vec: 'tm-vec' };
  var LYR = { sat: 'tm-base-sat', osm: 'tm-base-osm', bld: 'tm-buildings-3d' };
  // שכבות תוויות/גבולות — מודלקות/מכובות יחד דרך handle.setLabels(on)
  var LBL = ['tm-boundaries', 'tm-street-names', 'tm-hood-labels', 'tm-city-labels'];

  // שם בעברית אם קיים באריח, אחרת השם המקומי (בישראל name הוא ממילא עברית)
  var NAME_HE = ['coalesce', ['get', 'name:he'], ['get', 'name']];

  function _buildStyle(C, basemap, mode) {
    var satVis = basemap === 'satellite' ? 'visible' : 'none';
    var osmVis = basemap === 'satellite' ? 'none' : 'visible';
    var bldVis = mode === '3d' ? 'visible' : 'none';
    var s = C.sources;
    var sources = {};
    sources[SRC.sat] = { type: 'raster', tiles: s.satellite.tiles, tileSize: s.satellite.tileSize, maxzoom: s.satellite.maxzoom, attribution: s.satellite.attribution };
    sources[SRC.osm] = { type: 'raster', tiles: s.streets.tiles, tileSize: s.streets.tileSize, maxzoom: s.streets.maxzoom, attribution: s.streets.attribution };
    sources[SRC.dem] = { type: 'raster-dem', tiles: s.terrain.tiles, tileSize: s.terrain.tileSize, maxzoom: s.terrain.maxzoom, encoding: s.terrain.encoding, attribution: s.terrain.attribution };
    sources[SRC.vec] = { type: 'vector', url: s.buildings.url, attribution: s.buildings.attribution };
    var L = C.labels;
    var lblVis = 'visible';   // תוויות דולקות כברירת-מחדל; setLabels(false) מכבה
    return {
      version: 8,
      glyphs: L.glyphs,       // שרת גופנים — חובה לכל שכבת symbol עם טקסט
      sources: sources,
      layers: [
        { id: 'tm-bg', type: 'background', paint: { 'background-color': '#e8e4dc' } },
        { id: LYR.sat, type: 'raster', source: SRC.sat, layout: { visibility: satVis } },
        { id: LYR.osm, type: 'raster', source: SRC.osm, layout: { visibility: osmVis } },
        {
          // מבני תלת-מימד (OpenMapTiles building) — גלויים רק במצב 3d ומ-zoom ~14.5
          id: LYR.bld, type: 'fill-extrusion', source: SRC.vec,
          'source-layer': s.buildings.sourceLayer,
          minzoom: s.buildings.minzoom,
          filter: ['!=', ['get', 'hide_3d'], true],
          layout: { visibility: bldVis },
          paint: {
            'fill-extrusion-color': ['case', ['has', 'colour'], ['get', 'colour'], C.buildings3d.fallbackColor],
            // הגבהה הדרגתית בכניסה לטווח — המבנים "צומחים" בעדינות במקום לקפוץ
            'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'],
              s.buildings.minzoom, 0, s.buildings.minzoom + 1, ['coalesce', ['get', 'render_height'], 4]],
            'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'],
              s.buildings.minzoom, 0, s.buildings.minzoom + 1, ['coalesce', ['get', 'render_min_height'], 0]],
            'fill-extrusion-opacity': C.buildings3d.opacity
          }
        },

        // ── גבולות מוניציפליים/שכונתיים (admin_level 8-10, לא ימיים) ──
        {
          id: 'tm-boundaries', type: 'line', source: SRC.vec, 'source-layer': 'boundary',
          minzoom: L.boundaries.minzoom,
          filter: ['all',
            ['>=', ['get', 'admin_level'], 8], ['<=', ['get', 'admin_level'], 10],
            ['!=', ['get', 'maritime'], 1]],
          layout: { visibility: lblVis },
          paint: {
            'line-color': L.boundaries.color,
            'line-opacity': L.boundaries.opacity,
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 16, 2.5],
            'line-dasharray': [2, 2]
          }
        },

        // ── שמות רחובות — לאורך קו הרחוב ──
        {
          id: 'tm-street-names', type: 'symbol', source: SRC.vec, 'source-layer': 'transportation_name',
          minzoom: L.streets.minzoom,
          layout: {
            visibility: lblVis,
            'symbol-placement': 'line',
            'text-field': NAME_HE,
            'text-font': L.font,
            'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10.5, 16, 12.5, 19, 15]
          },
          paint: {
            'text-color': L.streets.color,
            'text-halo-color': L.streets.halo,
            'text-halo-width': L.streets.haloWidth
          }
        },

        // ── שכונות / רובעים ──
        {
          id: 'tm-hood-labels', type: 'symbol', source: SRC.vec, 'source-layer': 'place',
          minzoom: L.hoods.minzoom, maxzoom: L.hoods.maxzoom,
          filter: ['in', ['get', 'class'], ['literal', ['suburb', 'quarter', 'neighbourhood']]],
          layout: {
            visibility: lblVis,
            'text-field': NAME_HE,
            'text-font': L.fontBold,
            'text-size': ['interpolate', ['linear'], ['zoom'], 11, 11.5, 15, 14.5],
            'text-letter-spacing': 0.04
          },
          paint: {
            'text-color': L.hoods.color,
            'text-halo-color': L.hoods.halo,
            'text-halo-width': L.hoods.haloWidth
          }
        },

        // ── ערים / עיירות / יישובים (להתמצאות בזום רחוק) ──
        {
          id: 'tm-city-labels', type: 'symbol', source: SRC.vec, 'source-layer': 'place',
          minzoom: L.cities.minzoom, maxzoom: L.cities.maxzoom,
          filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village']]],
          layout: {
            visibility: lblVis,
            'text-field': NAME_HE,
            'text-font': L.fontBold,
            'text-size': ['interpolate', ['linear'], ['zoom'],
              6, ['match', ['get', 'class'], 'city', 13, 'town', 11, 9],
              13, ['match', ['get', 'class'], 'city', 19, 'town', 15, 13]]
          },
          paint: {
            'text-color': L.cities.color,
            'text-halo-color': L.cities.halo,
            'text-halo-width': L.cities.haloWidth
          }
        }
      ]
    };
  }

  // ───────────────────────── יצירת מפה + handle ─────────────────────────
  function create(containerEl, opts) {
    opts = opts || {};
    return ensureLib().then(function (maplibregl) {
      var C = window.TripMapConfig;
      var D = C.defaults;
      var basemap = opts.basemap === 'streets' ? 'streets' : 'satellite';
      var mode = opts.mode === '3d' ? '3d' : '2d';
      var center = opts.center || C.israel.center;

      // המפה עצמה LTR (controls/attribution של maplibre בנויים פיזית) —
      // תוכן עברי בתוך popups מקבל dir=rtl נקודתית, כך שדף ה-RTL לא נשבר
      containerEl.setAttribute('dir', 'ltr');

      var map = new maplibregl.Map({
        container: containerEl,
        style: _buildStyle(C, basemap, mode),
        center: [center.lng, center.lat],
        zoom: typeof opts.zoom === 'number' ? opts.zoom : D.zoom,
        pitch: typeof opts.pitch === 'number' ? opts.pitch : (mode === '3d' ? D.pitch3d : D.pitch),
        bearing: D.bearing,
        minZoom: D.minZoom,
        maxZoom: D.maxZoom,
        maxPitch: D.maxPitch,
        maxBounds: C.israel.bounds,
        attributionControl: { compact: true }   // קומפקטי — לא שובר layout בדף RTL
      });

      // אריח שנכשל (רשת רגעית) לא מציף את הקונסול בשגיאות אדומות
      map.on('error', function (e) {
        if (e && e.error) console.debug('tripmap:', e.error.message || e.error);
      });

      // ── state פנימי של ה-handle (נשאר כאן עם כל הקוראים/כותבים שלו) ──
      var state = { mode: mode, basemap: basemap, destroyed: false };
      var markers = [];   // [{id, group, marker}]
      var routes = [];    // [{id, group, srcId, lyrId}]
      var seq = 0;

      function applyMode(m) {
        state.mode = m;
        if (m === '3d') {
          map.setTerrain({ source: SRC.dem, exaggeration: C.sources.terrain.exaggeration });
          if (typeof map.setSky === 'function') { try { map.setSky(C.sky); } catch (e) { console.debug('tripmap sky:', e); } }
          map.setLayoutProperty(LYR.bld, 'visibility', 'visible');
          if (map.getPitch() < 25) map.easeTo({ pitch: D.pitch3d, duration: 900 });
        } else {
          map.setTerrain(null);
          if (typeof map.setSky === 'function') { try { map.setSky(null); } catch (e) { console.debug('tripmap sky:', e); } }
          map.setLayoutProperty(LYR.bld, 'visibility', 'none');
          map.easeTo({ pitch: 0, duration: 700 });
        }
      }

      var handle = {
        map: map,   // אובייקט maplibre גולמי — לשימוש סוכן B (controls/street)

        // 3d = פני שטח + שמיים + הטיה + מבנים · 2d = מנטרל הכל, pitch 0
        setMode: function (m) {
          if (state.destroyed || (m !== '2d' && m !== '3d') || m === state.mode) return;
          applyMode(m);
        },

        // הדלקה/כיבוי של כל התוויות והגבולות יחד (רחובות, שכונות, ערים)
        setLabels: function (on) {
          if (state.destroyed) return;
          var vis = on ? 'visible' : 'none';
          LBL.forEach(function (id) {
            try { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis); }
            catch (e) { console.debug('tripmap setLabels:', e); }
          });
        },

        // החלפת לוויין/רחובות ב-visibility בלבד — terrain/markers/routes נשמרים
        setBasemap: function (b) {
          if (state.destroyed || (b !== 'satellite' && b !== 'streets')) return;
          state.basemap = b;
          map.setLayoutProperty(LYR.sat, 'visibility', b === 'satellite' ? 'visible' : 'none');
          map.setLayoutProperty(LYR.osm, 'visibility', b === 'streets' ? 'visible' : 'none');
        },

        flyTo: function (o) {
          if (state.destroyed || !o) return;
          var t = { center: [o.lng, o.lat] };
          if (typeof o.zoom === 'number') t.zoom = o.zoom;
          if (typeof o.pitch === 'number') t.pitch = o.pitch;
          if (typeof o.bearing === 'number') t.bearing = o.bearing;
          map.flyTo(t);
        },

        // מיקוד המפה כך שכל הנקודות ייכנסו למסך. points = [[lng,lat], …]
        fitBounds: function (points, o) {
          if (state.destroyed || !points || !points.length) return;
          o = o || {};
          var w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
          points.forEach(function (p) {
            var lng = p[0], lat = p[1];
            if (!isFinite(lng) || !isFinite(lat)) return;
            if (lng < w) w = lng; if (lng > e) e = lng;
            if (lat < s) s = lat; if (lat > n) n = lat;
          });
          if (!isFinite(w) || !isFinite(s)) return;
          try {
            map.fitBounds([[w, s], [e, n]], {
              padding: o.padding != null ? o.padding : 70,
              maxZoom: o.maxZoom != null ? o.maxZoom : 15,
              duration: o.duration != null ? o.duration : 900,
              pitch: state.mode === '3d' ? (o.pitch != null ? o.pitch : 45) : 0
            });
          } catch (err) { console.debug('tripmap fitBounds:', err); }
        },

        // מחזיר markerId. label → popup (עברית, dir=rtl). onClick({id,lat,lng}).
        addMarker: function (o) {
          if (state.destroyed || !o) return null;
          var id = o.id != null ? String(o.id) : ('tm-mk-' + (++seq));
          // אותו id שוב = החלפה (מסיר את הישן)
          _removeMarkers(function (m) { return m.id === id; });
          var mk = new maplibregl.Marker({ color: o.color || C.markerColor })
            .setLngLat([o.lng, o.lat]);
          if (o.label) {
            var div = document.createElement('div');
            div.dir = 'rtl';
            div.style.cssText = 'font-family:inherit;font-size:13px;max-width:220px';
            div.textContent = o.label;
            mk.setPopup(new maplibregl.Popup({ offset: 28, closeButton: false }).setDOMContent(div));
          }
          // עוצר הִתפשטות כדי שקליק על marker לא יפעיל גם onClickMap
          mk.getElement().addEventListener('click', function (e) {
            e.stopPropagation();
            if (typeof o.onClick === 'function') {
              try { o.onClick({ id: id, lat: o.lat, lng: o.lng }); } catch (err) { console.debug('tripmap marker onClick:', err); }
            }
          });
          mk.addTo(map);
          markers.push({ id: id, group: o.group || null, marker: mk });
          return id;
        },

        clearMarkers: function (group) {
          if (state.destroyed) return;
          _removeMarkers(group == null ? null : function (m) { return m.group === group; });
        },

        // coords בפורמט GeoJSON: [[lng,lat], …]
        drawRoute: function (coords, o) {
          if (state.destroyed || !coords || coords.length < 2) return null;
          o = o || {};
          var id = o.id != null ? String(o.id) : ('tm-rt-' + (++seq));
          _removeRoutes(function (r) { return r.id === id; });   // אותו id = החלפה
          var srcId = 'tm-route-src-' + id, lyrId = 'tm-route-' + id;
          map.addSource(srcId, {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} }
          });
          // עובי קבוע (o.width) גובר על האינטרפולציה — שימושי למסלולים חלופיים דקים
          var width = (typeof o.width === 'number')
            ? o.width
            : ['interpolate', ['linear'], ['zoom'], 7, 2.5, 14, 5, 18, 8];
          var paint = {
            'line-color': o.color || C.routeColor,
            'line-width': width,
            'line-opacity': (typeof o.opacity === 'number') ? o.opacity : 0.9
          };
          if (Array.isArray(o.dash)) paint['line-dasharray'] = o.dash;   // מקווקו = חלופה
          map.addLayer({
            id: lyrId, type: 'line', source: srcId,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: paint
          });
          routes.push({ id: id, group: o.group || null, srcId: srcId, lyrId: lyrId });
          return id;
        },

        clearRoutes: function (group) {
          if (state.destroyed) return;
          _removeRoutes(group == null ? null : function (r) { return r.group === group; });
        },

        // מאזין קליק על המפה; מחזיר פונקציית הסרה (unsubscribe)
        onClickMap: function (cb) {
          var fn = function (e) {
            try { cb({ lat: e.lngLat.lat, lng: e.lngLat.lng }); } catch (err) { console.debug('tripmap onClickMap:', err); }
          };
          map.on('click', fn);
          return function () { map.off('click', fn); };
        },

        resize: function () { if (!state.destroyed) map.resize(); },

        destroy: function () {
          if (state.destroyed) return;
          state.destroyed = true;
          _removeMarkers(null);
          try { map.remove(); } catch (e) { console.debug('tripmap destroy:', e); }
        }
      };

      // pred=null → הכל; אחרת מסיר רק את העונים ל-predicate
      function _removeMarkers(pred) {
        for (var i = markers.length - 1; i >= 0; i--) {
          if (!pred || pred(markers[i])) {
            try { markers[i].marker.remove(); } catch (e) { console.debug('tripmap:', e); }
            markers.splice(i, 1);
          }
        }
      }
      function _removeRoutes(pred) {
        for (var i = routes.length - 1; i >= 0; i--) {
          if (!pred || pred(routes[i])) {
            var r = routes[i];
            try {
              if (map.getLayer(r.lyrId)) map.removeLayer(r.lyrId);
              if (map.getSource(r.srcId)) map.removeSource(r.srcId);
            } catch (e) { console.debug('tripmap:', e); }
            routes.splice(i, 1);
          }
        }
      }

      // resolve רק אחרי שה-style נטען — הקורא יכול מיד להוסיף markers/routes
      return new Promise(function (resolve, reject) {
        map.once('load', function () {
          if (state.mode === '3d') applyMode('3d');   // הפעלת terrain דורשת style טעון
          resolve(handle);
        });
        // אם ה-style עצמו לא הצליח להיטען בכלל (אין רשת) — נכשלים בעדינות
        map.once('error', function (e) {
          if (!map.isStyleLoaded() && !map.loaded()) {
            // ממתינים רגע — שגיאת אריח בודד אינה שגיאת style
            setTimeout(function () {
              if (!map.loaded() && !map.isStyleLoaded()) {
                try { map.remove(); } catch (err) { /* כבר הוסר */ }
                reject(new Error('המפה לא נטענה — נדרש חיבור אינטרנט למפה'));
              }
            }, 4000);
          }
        });
      });
    });
  }

  window.TripMapEngine = { ensureLib: ensureLib, create: create };
})();
