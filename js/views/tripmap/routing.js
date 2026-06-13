(function () {
  'use strict';
  // ── tripmap/routing.js — ניתוב נסיעה אמיתי (מסלול לפי כבישים) → window.TripRouting ─
  // אחריות יחידה: לקבל רשימת עצירות ולהחזיר מסלולי נהיגה אמיתיים (גאומטריה לפי
  // כבישים, מרחק, משך, ומספרי-כבישים) — כולל מסלול חלופי, כמו Waze. ספק: OSRM
  // הציבורי (config.routing). אפס DOM. נכשל בעדינות → הקורא נופל לקו אווירי.
  //
  // ממשק:
  //   TripRouting.route(coords) → Promise<{ ok, routes:[{coords,distanceKm,durationMin,roads}] }>
  //     coords: [[lng,lat], …] לפי סדר הביקור (>=2). routes[0] = הראשי, [1] = חלופה.
  //     נכשל (רשת/שרת/אין מסלול) → Promise.reject(Error) — הקורא מטפל.

  var _cache = {};   // מזעור בקשות חוזרות: key(coords) → תוצאה מנותחת

  function key(coords) {
    return coords.map(function (c) { return c[0].toFixed(4) + ',' + c[1].toFixed(4); }).join(';');
  }

  // חילוץ מספרי-כבישים ייחודיים מתוך ה-steps (לפי סדר הופעה, בלי כפילויות)
  function roadsFromLegs(legs) {
    var seen = {}, out = [];
    (legs || []).forEach(function (leg) {
      (leg.steps || []).forEach(function (st) {
        var ref = st && st.ref;
        if (!ref) return;
        // ref עשוי להיות "1;6" — מפצלים
        String(ref).split(';').forEach(function (r) {
          r = r.trim();
          if (r && !seen[r]) { seen[r] = 1; out.push(r); }
        });
      });
    });
    return out;
  }

  function parseRoute(r) {
    return {
      coords: (r.geometry && r.geometry.coordinates) || [],   // [[lng,lat], …]
      distanceKm: Math.round((r.distance || 0) / 100) / 10,
      durationMin: Math.round((r.duration || 0) / 60),
      roads: roadsFromLegs(r.legs)
    };
  }

  // משך אנושי: 95 → "1 ש' 35 דק'", 40 → "40 דק'"
  function durHuman(min) {
    min = Math.round(min || 0);
    if (min < 60) return min + ' דק\'';
    var h = Math.floor(min / 60), m = min % 60;
    return h + ' ש\'' + (m ? ' ' + m + ' דק\'' : '');
  }

  function route(coords) {
    var C = window.TripMapConfig;
    if (!C || !C.routing || !C.routing.osrm) {
      return Promise.reject(new Error('ניתוב לא מוגדר (config.routing חסר)'));
    }
    if (!coords || coords.length < 2) {
      return Promise.reject(new Error('נדרשות לפחות שתי נקודות לניתוב'));
    }
    var k = key(coords);
    if (_cache[k]) return Promise.resolve(_cache[k]);

    var path = coords.map(function (c) { return c[0] + ',' + c[1]; }).join(';');
    var url = C.routing.osrm + path +
      '?overview=full&geometries=geojson&steps=true' +
      (C.routing.alternatives ? '&alternatives=true' : '');

    return fetch(url).then(function (resp) {
      if (!resp.ok) throw new Error('שרת הניתוב החזיר ' + resp.status);
      return resp.json();
    }).then(function (data) {
      if (!data || data.code !== 'Ok' || !data.routes || !data.routes.length) {
        throw new Error('לא נמצא מסלול נסיעה בין הנקודות');
      }
      var maxAlt = (C.routing.maxAlternatives != null) ? C.routing.maxAlternatives : 1;
      var out = { ok: true, routes: data.routes.slice(0, 1 + maxAlt).map(parseRoute) };
      _cache[k] = out;
      return out;
    });
  }

  window.TripRouting = { route: route, durHuman: durHuman };
})();
