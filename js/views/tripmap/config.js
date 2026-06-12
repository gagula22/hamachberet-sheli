(function () {
  'use strict';
  // ── tripmap/config.js — מקור-אמת יחיד לספקי אריחים, גבולות ישראל וברירות-מחדל ──
  // כל החלפת ספק (לוויין/רחובות/פני-שטח/מבנים) נעשית **רק כאן**. engine.js רק צורך.
  // כל המקורות חינמיים, בלי מפתח API, ואומתו (HTTP 200 + CORS '*') ביוני 2026:
  //   · לוויין  — Esri World Imagery. רזולוציה אמיתית בישראל עד z=19 (נבדק באריח ת"א;
  //              z=20 מחזיר אריח-דמה ריק). מעבר ל-19 MapLibre מגדיל את אריחי 19 (overzoom).
  //   · רחובות — OSM raster רשמי (תוויות בעברית בישראל), עד z=19.
  //   · פני שטח — AWS Terrain Tiles (Mapzen, terrarium PNG), raster-dem עד z=15.
  //   · מבנים  — OpenFreeMap vector tiles (סכימת OpenMapTiles): שכבת building עם
  //              render_height / render_min_height / hide_3d. ה-URL הוא tileJSON —
  //              MapLibre שולף ממנו לבד את כתובת האריחים המתוארכת העדכנית.

  window.TripMapConfig = {

    // ספריית MapLibre GL JS v5.24.0 — מאורזת מקומית, עם fallback ל-CDN אם חסרה
    lib: {
      version:   '5.24.0',
      vendorJs:  'js/vendor/maplibre/maplibre-gl.js',
      vendorCss: 'js/vendor/maplibre/maplibre-gl.css',
      cdnJs:     'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js',
      cdnCss:    'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css',
      // תוסף עיצוב טקסט RTL — בלעדיו תוויות עברית מצוירות בסדר אותיות הפוך.
      // נטען עצלה (lazy) ע"י maplibre רק כשמופיעה תווית RTL ראשונה.
      vendorRtl: 'js/vendor/maplibre/maplibre-gl-rtl-text.min.js',
      cdnRtl:    'https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.min.js'
    },

    // ארץ ישראל: מרכז ברירת-מחדל + maxBounds רחב ([מערב,דרום],[מזרח,צפון])
    // רחב בכוונה — משאיר הקשר אזורי (סיני/ים-תיכון/ירדן) בלי לברוח לעולם
    israel: {
      center: { lat: 31.5, lng: 34.9 },
      bounds: [[32.0, 28.5], [37.8, 34.3]]
    },

    // ברירות מחדל למפה (ניתנות לדריסה ב-opts של TripMapEngine.create)
    defaults: {
      zoom: 7.5,
      minZoom: 6,
      maxZoom: 20,        // z19 אריחים אמיתיים + רמת overzoom אחת לזום חלק עד רמת בניין
      maxPitch: 75,
      pitch: 0,
      bearing: 0,
      pitch3d: 60,        // הטיה התחלתית כשעוברים למצב תלת-מימד
      mode: '2d',
      basemap: 'satellite'
    },

    // מקורות אריחים — אומתו ב-curl (סטטוס 200 + Access-Control-Allow-Origin: *)
    sources: {
      satellite: {
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 19,      // ה-maxZoom האמיתי שנמדד בישראל (ת"א) — מעליו overzoom
        attribution: 'Imagery © Esri, Maxar, Earthstar Geographics'
      },
      streets: {
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
      },
      terrain: {
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 15,
        encoding: 'terrarium',
        exaggeration: 1.3,   // הגזמת גובה עדינה — הרים מורגשים בלי לעוות
        attribution: 'Terrain: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Mapzen/AWS</a>'
      },
      buildings: {
        url: 'https://tiles.openfreemap.org/planet',   // tileJSON — לא כתובת אריח ישירה
        sourceLayer: 'building',
        minzoom: 14.5,       // מבנים מופיעים רק מקרוב, ורק במצב 3d
        attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a>'
      }
    },

    // מראה מבני התלת-מימד (fill-extrusion): צבע מהאריח אם קיים, אחרת חול בהיר.
    // אין תלת-מימד פוטוריאליסטי חינמי לישראל (גוגל לא פתחו 3D Tiles לארץ) —
    // לכן הקוביות שקופות-למחצה, כדי שתצלום הלוויין האמיתי ייראה דרכן.
    buildings3d: {
      fallbackColor: '#d9cfc0',
      opacity: 0.55
    },

    // ── תוויות וגבולות (שכבת ה-vector של OpenFreeMap, סכימת OpenMapTiles) ──
    // glyphs = שרת הגופנים של אותו ספק (אומת 200). השדות text-field מעדיפים
    // name:he ונופלים ל-name. הכל מודלק/מכובה יחד דרך handle.setLabels(on).
    labels: {
      glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      font:     ['Noto Sans Regular'],
      fontBold: ['Noto Sans Bold'],
      streets: {            // שמות רחובות — source-layer: transportation_name
        minzoom: 13,
        color: '#ffffff', halo: '#1f2733', haloWidth: 1.6
      },
      hoods: {               // שכונות/רובעים — place: suburb/quarter/neighbourhood
        minzoom: 11, maxzoom: 16.5,
        color: '#ffe9b8', halo: '#3a3322', haloWidth: 1.8
      },
      cities: {              // ערים/עיירות/יישובים — place: city/town/village
        minzoom: 6,  maxzoom: 14,
        color: '#ffffff', halo: '#222b38', haloWidth: 2
      },
      boundaries: {          // גבולות מוניציפליים/שכונתיים — boundary: admin_level 8-10
        minzoom: 10,
        color: '#ffd86e', opacity: 0.7
      }
    },

    // שמיים + אובך אופק למצב 3d (מוחל רק אם הגרסה תומכת ב-setSky)
    sky: {
      'sky-color': '#8fc4e8',
      'horizon-color': '#f4ede1',
      'fog-color': '#e3ddd2',
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.6,
      'fog-ground-blend': 0.7
    },

    // צבעי ברירת-מחדל לסימונים על המפה
    markerColor: '#c0564e',
    routeColor: '#5a78c7'
  };
})();
