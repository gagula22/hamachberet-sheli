(function () {
  'use strict';
  // ============================================================================
  // tripmap/planner-engine.js — מנוע התכנון העצמאי (בלי LLM)
  // ----------------------------------------------------------------------------
  // בעלות: סוכן E בלבד. namespace: window.TripPlannerEngine.
  // לוגיקה טהורה: אפס DOM, אפס fetch, אפס תלות ב-maplibre. צורך אך ורק
  // את window.TripPlannerData (סוכן D). ממשק plan(params) מקובע ב-CONTRACT.md.
  //
  // משחזר את כללי הסקיל trip-planner-metakhnen-tiyulim:
  //   • 2-3 אטרקציות ביום מקסימום (יותר = ריצה)
  //   • היום הראשון תמיד קליל
  //   • סדר גיאוגרפי (nearest-neighbor מנקודת הלינה)
  //   • שבת / עונה / הרכב / סגנון / גשם
  //   • טבלת תקציב, ציוד, מלכודות, הערות ישראל
  // ============================================================================

  var SP = 'spring', SU = 'summer', AU = 'autumn', WI = 'winter';

  // ── עזרי בסיס ───────────────────────────────────────────────────────────────

  function DATA() {
    var d = (typeof window !== 'undefined') ? window.TripPlannerData : null;
    if (!d || !d.regions || !d.attractions) {
      throw new Error('מאגר הידע (TripPlannerData) חסר — לא ניתן לתכנן טיול. ודאו ש-planner-data.js נטען לפני המנוע.');
    }
    return d;
  }

  // seed דטרמיניסטי פשוט (mulberry32) — מאפשר גיוון בין הפעלות מבלי לקרוס בלעדיו.
  function rng(seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function haversineKm(a, b) {
    if (!a || !b) return Infinity;
    var la1 = +a.lat, lo1 = +a.lng, la2 = +b.lat, lo2 = +b.lng;
    if (!isFinite(la1) || !isFinite(lo1) || !isFinite(la2) || !isFinite(lo2)) return Infinity;
    var R = 6371, toR = Math.PI / 180;
    var dLat = (la2 - la1) * toR, dLon = (lo2 - lo1) * toR;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(la1 * toR) * Math.cos(la2 * toR) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  function monthToSeason(m) {
    m = +m;
    if (!(m >= 1 && m <= 12)) return null;
    if (m === 3 || m === 4 || m === 5) return SP;
    if (m === 6 || m === 7 || m === 8) return SU;
    if (m === 9 || m === 10 || m === 11) return AU;
    return WI; // 12,1,2
  }

  // טווח טיסה לפי עונה: peak=קיץ/חגים(7,8,12), low=ביניים(1-3,11), אחרת regular.
  function flightTier(month) {
    var m = +month;
    if (!(m >= 1 && m <= 12)) return 'regular';
    if (m === 7 || m === 8 || m === 12) return 'peak';
    if (m === 1 || m === 2 || m === 3 || m === 11) return 'low';
    return 'regular';
  }

  function clampInt(v, lo, hi, dflt) {
    v = parseInt(v, 10);
    if (!isFinite(v)) v = dflt;
    if (v < lo) v = lo;
    if (v > hi) v = hi;
    return v;
  }

  function mid(range) { // [lo,hi] → אמצע מעוגל
    if (!range || range.length < 2) return 0;
    return Math.round((range[0] + range[1]) / 2);
  }

  // עלות אטרקציה 0-3 → ש"ח לאדם (כלל הסקיל)
  var COST_NIS = { 0: 0, 1: 35, 2: 90, 3: 180 };
  function attractionCostNis(c) { return COST_NIS[c] != null ? COST_NIS[c] : 0; }

  // ── נקודת מוצא (עיר מגורים) → מרחק/זמן-נסיעה משוער ───────────────────────────
  // מקבל {name,lat?,lng?} או מחרוזת שם; משלים קואורדינטות מ-originCities לפי שם.
  // זמן נסיעה ~ מרחק-אווירי × 1.3 (פיתולי כביש) / 75 קמ"ש ממוצע בינעירוני.
  function resolveOrigin(origin) {
    if (!origin) return null;
    var name = (typeof origin === 'string') ? origin : (origin.name || '');
    name = String(name).trim();
    if (!name) return null;
    var lat = (origin && isFinite(+origin.lat)) ? +origin.lat : null;
    var lng = (origin && isFinite(+origin.lng)) ? +origin.lng : null;
    if (lat == null || lng == null) {              // השלמה מהרשימה לפי שם
      var d = DATA();
      var match = (d.originCities || []).filter(function (c) {
        return c.name === name || c.name.indexOf(name) === 0 || name.indexOf(c.name) === 0;
      })[0];
      if (match) { lat = match.lat; lng = match.lng; name = match.name; }
    }
    return { name: name, lat: lat, lng: lng };
  }

  // מחזיר {km, min, text} מנקודת מוצא ליעד — או null אם אין קואורדינטות מוצא
  function driveFromOrigin(origin, target) {
    if (!origin || origin.lat == null || origin.lng == null || !target) return null;
    var km = haversineKm({ lat: origin.lat, lng: origin.lng }, target);
    if (!isFinite(km)) return null;
    var roadKm = Math.round(km * 1.3);
    var min = Math.round(roadKm / 75 * 60);
    var dur = (min >= 60) ? (Math.floor(min / 60) + ' ש\'' + (min % 60 ? ' ' + (min % 60) + ' דק\'' : '')) : (min + ' דק\'');
    return { km: roadKm, min: min, text: '~' + roadKm + ' ק"מ (כ-' + dur + ' נסיעה)' };
  }

  // ── ולידציה של params + ברירות מחדל שפויות ──────────────────────────────────

  function normalizeParams(p) {
    p = p || {};
    var kind = p.kind;
    if (kind !== 'israel' && kind !== 'abroad' && kind !== 'getaway' && kind !== 'surprise') {
      kind = 'israel';
    }
    var comp = p.composition || {};
    var type = comp.type;
    if (['couple', 'family', 'friends', 'solo'].indexOf(type) === -1) type = 'family';
    var kidsAges = Array.isArray(comp.kidsAges) ? comp.kidsAges.map(Number).filter(function (n) { return isFinite(n); }) : [];

    var style = p.style;
    if (['nature', 'attractions', 'food', 'mixed'].indexOf(style) === -1) style = 'mixed';

    var budgetLevel = p.budgetLevel;
    if (['free', 'budget', 'mid', 'premium'].indexOf(budgetLevel) === -1) budgetLevel = 'mid';

    var days = clampInt(p.days, 1, 14, kind === 'getaway' ? 2 : 3);
    var nights = (p.nights != null) ? clampInt(p.nights, 0, 14, days) : Math.max(0, days - 1);
    var month = (p.month != null && +p.month >= 1 && +p.month <= 12) ? +p.month : null;

    return {
      kind: kind,
      days: days,
      nights: nights,
      month: month,
      season: monthToSeason(month),
      composition: { type: type, kidsAges: kidsAges },
      budgetLevel: budgetLevel,
      budgetTotal: (p.budgetTotal != null && isFinite(+p.budgetTotal)) ? +p.budgetTotal : null,
      style: style,
      region: p.region || null,
      origin: resolveOrigin(p.origin),
      destination: p.destination || null,
      important: p.important || null,
      avoid: p.avoid || null,
      people: clampInt(p.people, 1, 20, type === 'couple' ? 2 : (type === 'solo' ? 1 : (type === 'family' ? 4 : 3))),
      seed: (p.seed != null && isFinite(+p.seed)) ? (+p.seed >>> 0) : 12345
    };
  }

  // ── התאמת אטרקציה למשתמש (סינון + ניקוד) ────────────────────────────────────

  function kidsOk(att, kidsAges, type) {
    if (type !== 'family' || !kidsAges.length) return true;
    var youngest = Math.min.apply(null, kidsAges);
    switch (att.kids) {
      case 'all': return true;
      case '4+': return youngest >= 4;
      case '8+': return youngest >= 8;
      case 'teens': return youngest >= 11;
      case 'no': return false;
      default: return true;
    }
  }

  function seasonOk(att, season) {
    if (!season) return true;
    if (!Array.isArray(att.seasons) || !att.seasons.length) return true;
    return att.seasons.indexOf(season) !== -1;
  }

  function styleScore(att, style) {
    var t = att.type;
    var natureSet = { nature: 1, water: 1, beach: 1, view: 1 };
    var attrSet = { fun: 1, museum: 1, history: 1, spa: 1 };
    var foodSet = { market: 1 };
    switch (style) {
      case 'nature': return natureSet[t] ? 3 : (t === 'history' ? 1 : 0);
      case 'attractions': return attrSet[t] ? 3 : (t === 'view' ? 1 : 0);
      case 'food': return foodSet[t] ? 3 : (t === 'fun' ? 1 : 0);
      default: return 1; // mixed — הכל שווה
    }
  }

  // לזוג בלי ילדים: אטרקציות kids:'no' (יקבים/ספא) הן בונוס, לא חיסרון.
  function audienceBonus(att, type) {
    if (type === 'couple' && (att.kids === 'no' || att.type === 'spa')) return 1.5;
    if (type === 'friends' && (att.type === 'fun' || att.type === 'market')) return 1;
    return 0;
  }

  // פעוטות 0-3: העדף durationH קצר + מים/חוף/קרבה (כלל הסקיל).
  function toddlerPenalty(att, kidsAges, type) {
    if (type !== 'family' || !kidsAges.length) return 0;
    var youngest = Math.min.apply(null, kidsAges);
    if (youngest > 3) return 0;
    var p = 0;
    if (att.durationH > 2.5) p -= 2;
    if (att.type === 'water' || att.type === 'beach') p += 1;
    if (att.type === 'history' || att.type === 'museum') p -= 0.5;
    return p;
  }

  function candidateAttractions(regionId, params) {
    var d = DATA();
    var c = params.composition;
    return d.attractions.filter(function (a) {
      return a.region === regionId &&
             seasonOk(a, params.season) &&
             kidsOk(a, c.kidsAges, c.type);
    }).map(function (a) {
      var score = styleScore(a, params.style)
                + audienceBonus(a, c.type)
                + toddlerPenalty(a, c.kidsAges, c.type);
      return { att: a, score: score };
    });
  }

  // ── בחירת אזור אוטומטית (עונה + הרכב) ────────────────────────────────────────

  function pickRegion(params) {
    var d = DATA();
    if (params.region && params.region !== 'suggest') {
      var found = d.regions.filter(function (r) { return r.id === params.region; })[0];
      if (found) return found;
    }
    var season = params.season;
    var type = params.composition.type;
    var ranked = d.regions.map(function (r) {
      var s = 0;
      if (season && r.seasons.indexOf(season) !== -1) s += 3;
      if (r.audiences.indexOf(type) !== -1) s += 2;
      // קיץ: הימנע ממדבר/ים המלח/מצדה; העדף צפון-מים/חוף.
      if (season === SU) {
        if (['deadsea', 'ramon', 'eilat'].indexOf(r.id) !== -1) s -= 4;
        if (['kineret', 'galil', 'golan', 'telaviv', 'haifa'].indexOf(r.id) !== -1) s += 2;
      }
      return { r: r, s: s };
    }).sort(function (a, b) { return b.s - a.s; });
    return ranked[0].r;
  }

  // ── בחירת לינה לפי תקציב + הרכב ──────────────────────────────────────────────

  function pickLodging(regionId, params) {
    var d = DATA();
    var type = params.composition.type;
    var inRegion = d.lodging.filter(function (l) { return l.region === regionId; });
    if (!inRegion.length) return null;

    function rank(l) {
      var s = 0;
      if (l.level === params.budgetLevel) s += 5;
      else s -= Math.abs(levelIdx(l.level) - levelIdx(params.budgetLevel));
      if (type === 'couple' && l.romantic) s += 2;
      if (type === 'family' && l.family) s += 2;
      if (type === 'family' && l.pool) s += 1;
      return s;
    }
    return inRegion.slice().sort(function (a, b) { return rank(b) - rank(a); })[0];
  }

  function levelIdx(lv) { return { free: 0, budget: 1, mid: 2, premium: 3 }[lv] || 0; }

  // ── בחירת מסעדה קרובה (לא לחזור) ─────────────────────────────────────────────

  function nearestRestaurant(regionId, point, used, style) {
    var d = DATA();
    var pool = d.restaurants.filter(function (r) {
      return r.region === regionId && used.indexOf(r.id) === -1;
    });
    if (!pool.length) {
      // נפתח שוב את כל מסעדות האזור אם נגמרו
      pool = d.restaurants.filter(function (r) { return r.region === regionId; });
    }
    if (!pool.length) return null;
    pool.sort(function (a, b) {
      var da = haversineKm(point, a), db = haversineKm(point, b);
      if (style === 'food') { // לסגנון אוכל — קצת משקל לאיכות (price גבוה)
        da -= a.price * 1.5; db -= b.price * 1.5;
      }
      return da - db;
    });
    return pool[0];
  }

  // ── greedy nearest-neighbor: סידור אטרקציות מנקודת הלינה ─────────────────────

  function orderGeographically(items, start) {
    var remaining = items.slice();
    var route = [];
    var cur = start;
    while (remaining.length) {
      var bestI = 0, bestD = Infinity;
      for (var i = 0; i < remaining.length; i++) {
        var dist = haversineKm(cur, remaining[i].att);
        if (dist < bestD) { bestD = dist; bestI = i; }
      }
      var next = remaining.splice(bestI, 1)[0];
      route.push(next);
      cur = next.att;
    }
    return route;
  }

  // ── שעות משוערות לבלוקים של יום ──────────────────────────────────────────────

  var DAY_TIMES = { morning: '09:00', lunch: '12:30', afternoon: '15:00', evening: '19:00' };

  // ── ציוד (חשוף גם בנפרד) ─────────────────────────────────────────────────────

  function buildPacking(params) {
    var d = DATA();
    var pk = d.packing || {};
    var out = (pk.base || []).slice();
    var season = params.season;
    var c = params.composition;

    if (season === SU) out = out.concat(pk.summer || []);
    if (season === WI) out = out.concat(pk.winter || []);

    if (c.type === 'family' && c.kidsAges.length) {
      out = out.concat(pk.kids || []);
      if (Math.min.apply(null, c.kidsAges) <= 2) out = out.concat(pk.baby || []);
    }

    if (params.kind === 'abroad') {
      out = out.concat(pk.abroad || []);
    } else {
      // ארץ: לפי סגנון
      if (params.style === 'nature') out = out.concat(pk.hiking || []);
      // אזורי-חוף/מים — מוסיף ציוד חוף
      if (params._beachish || params.style === 'mixed') out = out.concat(pk.beach || []);
    }
    // הסרת כפילויות תוך שמירת סדר
    var seen = {}, res = [];
    out.forEach(function (x) { if (!seen[x]) { seen[x] = 1; res.push(x); } });
    return res;
  }

  // ── טיפים: מלכודות רלוונטיות + הערות ישראל ───────────────────────────────────

  function tipsForIsrael(params, hasShabbat, season) {
    var d = DATA();
    var tips = [];
    var notes = d.israelNotes || {};
    if (hasShabbat && notes.shabbat) tips.push('שבת: ' + notes.shabbat);
    if (notes.seasons) tips.push('עונה: ' + notes.seasons);
    if (params.composition.type === 'family' && params.composition.kidsAges.length && notes.kids) {
      tips.push('ילדים: ' + notes.kids);
    }
    // מלכודות רלוונטיות
    (d.pitfalls || []).forEach(function (p) {
      if (p.trap.indexOf('נספיק') !== -1 || p.trap.indexOf('הראשון') !== -1) {
        tips.push(p.trap + ' — ' + p.truth);
      }
      if (params.composition.type === 'family' && p.trap.indexOf('הילדים') !== -1) {
        tips.push(p.trap + ' — ' + p.truth);
      }
    });
    return tips;
  }

  function tipsForAbroad(dest, params) {
    var d = DATA();
    var tips = [];
    tips.push('שפה: ' + dest.language + ' · מטבע: ' + dest.currency + ' · הפרש שעות: ' + dest.timeDiff + '.');
    if (params.kosher || params.important === 'kosher') {
      tips.push(dest.kosher
        ? 'כשרות: ביעד יש קהילה יהודית/אפשרויות כשרות — חפשו בית חב"ד ומסעדות כשרות מראש.'
        : 'כשרות: אין קהילה יהודית בולטת — הביאו ציוד בישול ומזון, או תכננו ארוחות צמחוניות/דגים.');
    }
    (d.pitfalls || []).forEach(function (p) { tips.push(p.trap + ' — ' + p.truth); });
    return tips;
  }

  // ============================================================================
  // A) ISRAEL — תוכנית יום-יום אמיתית
  // ============================================================================

  function planIsrael(params) {
    var d = DATA();
    var region = pickRegion(params);
    var lodging = pickLodging(region.id, params);
    var lodgingPoint = lodging ? { lat: lodging.lat, lng: lodging.lng } : region.center;
    // נקודת מוצא (עיר מגורים) → נסיעה לבסיס הטיול (לינה/מרכז האזור)
    var originDrive = driveFromOrigin(params.origin, lodgingPoint);
    var season = params.season;
    var rand = rng(params.seed);

    // האם הטיול כולל שבת? אם 'nights'>=2 בהנחה תחילת סופ"ש — נשתמש בכלל פשוט:
    // אם month נתון לא משנה את היום; נחשיב "כולל שבת" כשהטיול >=2 ימים (סביר שיש סופ"ש).
    var hasShabbat = params.days >= 2;

    // בריכה לשימוש packing
    params._beachish = ['kineret', 'telaviv', 'haifa', 'eilat', 'deadsea'].indexOf(region.id) !== -1;

    // מאגר מועמדים ממוין לפי ניקוד
    var cands = candidateAttractions(region.id, params)
      .sort(function (a, b) { return (b.score - a.score) || (rand() - 0.5); });

    // fallback: אם סינון העונה/ילדים השאיר מעט מדי — נרפה את סינון הילדים
    if (cands.length < params.days * 2) {
      var relaxed = d.attractions.filter(function (a) {
        return a.region === region.id && seasonOk(a, season);
      }).map(function (a) { return { att: a, score: styleScore(a, params.style) }; });
      // מיזוג ייחודי
      var ids = {};
      cands.forEach(function (c) { ids[c.att.id] = 1; });
      relaxed.forEach(function (c) { if (!ids[c.att.id]) cands.push(c); });
      cands.sort(function (a, b) { return b.score - a.score; });
    }

    var usedAtt = {};
    var usedRest = [];
    var trip = { id: 'plan_' + region.id + '_' + params.seed, title: '', region: region.id, createdAt: Date.now(), days: [] };
    var docDays = [];
    var shabbatPlaced = false;
    var rainAltGlobal = null;

    for (var dnum = 1; dnum <= params.days; dnum++) {
      var isFirst = dnum === 1;
      // היום הראשון קליל: 2 אטרקציות; שאר הימים 3.
      var target = isFirst ? 2 : 3;

      // שבת: ביום אחד העדף shabbatOpen=true
      var preferShabbat = hasShabbat && !shabbatPlaced && (dnum === Math.min(2, params.days));

      var picks = [];
      // אם יום-שבת — קודם בחר shabbatOpen
      var pool = cands.filter(function (c) { return !usedAtt[c.att.id]; });
      if (preferShabbat) {
        pool.sort(function (a, b) {
          var sa = a.att.shabbatOpen ? 1 : 0, sb = b.att.shabbatOpen ? 1 : 0;
          return (sb - sa) || (b.score - a.score);
        });
      }
      for (var k = 0; k < pool.length && picks.length < target; k++) {
        picks.push(pool[k]);
      }
      picks.forEach(function (p) { usedAtt[p.att.id] = 1; });
      if (preferShabbat && picks.some(function (p) { return p.att.shabbatOpen; })) shabbatPlaced = true;

      // סדר גיאוגרפי מנקודת הלינה
      var ordered = orderGeographically(picks, lodgingPoint);

      // בלוקים: בוקר → צהריים(מסעדה) → אחה"צ → (ערב מסעדה)
      var blocks = [];
      var stops = [];
      var dayCost = 0;
      var whenKeys = ['morning', 'afternoon'];
      // אם 3 אטרקציות — נוסיף בלוק "view"/ערב מוקדם נוסף
      ordered.forEach(function (item, idx) {
        var a = item.att;
        var when = idx === 0 ? 'בוקר' : (idx === 1 ? 'אחה"צ' : 'לפנות ערב');
        var timeKey = idx === 0 ? 'morning' : (idx === 1 ? 'afternoon' : 'evening');
        var cost = attractionCostNis(a.cost) * params.people;
        dayCost += cost;
        var what = a.name;
        if (a.needsBooking) what += ' (להזמין מראש)';
        blocks.push({
          when: when, what: what, desc: a.desc + (a.tip ? ' · ' + a.tip : ''),
          cost: cost
        });
        stops.push({
          name: a.name, lat: a.lat, lng: a.lng,
          time: DAY_TIMES[timeKey] || '15:00',
          note: a.desc, type: a.type
        });
      });

      // צהריים — מסעדה קרובה לנקודה הראשונה של היום
      var anchor = ordered.length ? ordered[0].att : lodgingPoint;
      var lunchR = nearestRestaurant(region.id, anchor, usedRest, params.style);
      if (lunchR) {
        usedRest.push(lunchR.id);
        var lunchCost = lunchR.price * 45 * params.people; // price 1/2/3 → ~45/90/135 לאדם
        dayCost += lunchCost;
        blocks.splice(1, 0, { // אחרי הבוקר
          when: 'צהריים', what: lunchR.name, desc: lunchR.style + ' · ' + lunchR.desc + (lunchR.kosher ? ' · כשר' : ''),
          cost: lunchCost
        });
        stops.push({ name: lunchR.name, lat: lunchR.lat, lng: lunchR.lng, time: DAY_TIMES.lunch, note: lunchR.style, type: 'restaurant' });
      }

      // ערב — מסעדה (אם לא כבר 3 אטרקציות שתפסו את הערב)
      if (ordered.length < 3) {
        var dinnerR = nearestRestaurant(region.id, lodgingPoint, usedRest, params.style);
        if (dinnerR) {
          usedRest.push(dinnerR.id);
          var dinnerCost = dinnerR.price * 55 * params.people;
          dayCost += dinnerCost;
          blocks.push({ when: 'ערב', what: dinnerR.name, desc: dinnerR.style + ' · ' + dinnerR.desc + (dinnerR.kosher ? ' · כשר' : ''), cost: dinnerCost });
          stops.push({ name: dinnerR.name, lat: dinnerR.lat, lng: dinnerR.lng, time: DAY_TIMES.evening, note: dinnerR.style, type: 'restaurant' });
        }
      }

      // אלטרנטיבת גשם (חורף): אטרקציה rainOk חלופית שלא נבחרה
      var dayTip = null;
      if (season === WI) {
        var rainCand = d.attractions.filter(function (a) {
          return a.region === region.id && a.rainOk && !usedAtt[a.id];
        })[0];
        if (rainCand) {
          dayTip = 'אלטרנטיבה לגשם: ' + rainCand.name + ' — ' + rainCand.desc;
          if (!rainAltGlobal) rainAltGlobal = rainCand.name + ' (' + rainCand.desc + ')';
        }
      }

      var dayTitle = ordered.length ? ordered.map(function (i) { return i.att.name; })[0] + ' וסביבתה'
                                    : ('יום ' + dnum);

      // יום ראשון: אם יש עיר מוצא — מציינים את הנסיעה מהבית לאזור
      var transport;
      if (isFirst && params.origin && originDrive) {
        transport = 'יציאה מ' + params.origin.name + ' לכיוון ' + region.name +
                    ' — ' + originDrive.text + '. משם נסיעה ברכב בין הנקודות.';
      } else if (isFirst && params.origin) {
        transport = 'יציאה מ' + params.origin.name + ' לכיוון ' + region.name +
                    '. נסיעה ברכב בין הנקודות.';
      } else {
        transport = 'נסיעה ברכב בין הנקודות; מומלץ לצאת מ' + (lodging ? lodging.name : region.name) + ' בבוקר.';
      }
      trip.days.push({ n: dnum, title: 'יום ' + dnum + ' — ' + dayTitle, stops: stops });
      // geo = העצירות עם קואורדינטות (לבניית מפות בייצוא + מסלול לפי יום)
      var geo = stops.filter(function (s) { return isFinite(s.lat) && isFinite(s.lng); })
        .map(function (s, gi) { return { n: gi + 1, name: s.name, lat: s.lat, lng: s.lng, type: s.type }; });
      docDays.push({
        n: dnum,
        title: 'יום ' + dnum + ' — ' + dayTitle + (isFirst ? ' (יום ראשון קליל)' : ''),
        blocks: blocks,
        geo: geo,
        transport: transport,
        tip: dayTip,
        costPerDay: dayCost
      });
    }

    trip.title = 'טיול ב' + region.name + ' — ' + params.days + ' ימים';
    if (params.origin) trip.origin = params.origin;   // {name,lat?,lng?} — נקודת מוצא

    // טבלת תקציב
    var lodgingTotal = lodging ? mid(lodging.priceNight) * params.nights : 0;
    var foodTotal = 0, attrTotal = 0;
    docDays.forEach(function (dd) {
      dd.blocks.forEach(function (b) {
        if (b.cost == null) return;
        if (b.when === 'צהריים' || b.when === 'ערב') foodTotal += b.cost;
        else attrTotal += b.cost;
      });
    });
    var budgetTable = [
      { cat: 'לינה', perDay: params.nights ? Math.round(lodgingTotal / params.nights) : 0, total: lodgingTotal },
      { cat: 'אוכל', perDay: Math.round(foodTotal / params.days), total: foodTotal },
      { cat: 'אטרקציות וכניסות', perDay: Math.round(attrTotal / params.days), total: attrTotal },
      { cat: 'סה"כ', perDay: null, total: lodgingTotal + foodTotal + attrTotal }
    ];

    var originLine = '';
    if (params.origin) {
      originLine = 'יציאה מ' + params.origin.name +
                   (originDrive ? ' (' + originDrive.text + ' לאזור)' : '') + '. ';
    }
    var doc = {
      title: trip.title,
      overview: originLine + region.desc + ' ' + (lodging ? ('בסיס: ' + lodging.name + '. ') : '') +
                'התוכנית מסודרת גיאוגרפית כדי לחסוך נסיעות, עם 2-3 עצירות ביום (היום הראשון קליל).',
      days: docDays,
      origin: params.origin || null,   // נקודת מוצא — לסימון "התחלה" במפות הייצוא
      budgetTable: budgetTable,
      packing: buildPacking(params),
      checklist: [],
      tips: tipsForIsrael(params, hasShabbat, season),
      lodging: lodging ? (lodging.name + ' — ' + lodging.desc + ' (₪' + lodging.priceNight[0] + '-' + lodging.priceNight[1] + ' ללילה)') : null,
      rainAlt: rainAltGlobal
    };

    return { kind: 'israel', trip: trip, doc: doc };
  }

  // ============================================================================
  // B) ABROAD — doc מלא בלי מפה
  // ============================================================================

  function getDestination(id) {
    var d = DATA();
    var dests = (d.abroad && d.abroad.destinations) || [];
    return dests.filter(function (x) { return x.id === id; })[0] || dests[0] || null;
  }

  function buildAbroadDays(dest, days) {
    var tmpl = (dest.days || []).slice();
    var out = [];
    if (!tmpl.length) return out;
    for (var i = 0; i < days; i++) {
      if (i < tmpl.length) {
        out.push(tmpl[i]);
      } else {
        // מעבר לתבנית — שלב ימי "חופשי/שוק/חוף" הגיוניים
        var fillers = [
          { title: 'יום חופשי וגמיש', morning: 'בוקר נינוח — שוק מקומי או בית קפה', lunch: 'אוכל רחוב מקומי', afternoon: 'חזרה לאתר אהוב או שכונה שלא הספקתם', evening: 'ארוחת ערב מסכמת', tip: 'יום גמיש מאזן את הקצב — אל תעמיסו.' },
          { title: 'חוף / טבע ומנוחה', morning: 'יום חוף, פארק או טיול קל', lunch: 'פיקניק או מסעדה מקומית', afternoon: 'שחייה / שכשוך / מנוחה', evening: 'שקיעה ובילוי רגוע', tip: 'יום מנוחה אחד לפחות — חובה בטיול ארוך.' },
          { title: 'שוק וקניות', morning: 'שוק מרכזי ומזכרות', lunch: 'טעימות בשוק', afternoon: 'רובע קניות / בוטיקים', evening: 'ארוחת פרידה במסעדה מומלצת', tip: 'השאירו קניות לסוף — נוח לאריזה.' }
        ];
        out.push(fillers[(i - tmpl.length) % fillers.length]);
      }
    }
    return out;
  }

  function planAbroad(params) {
    var dest = getDestination(params.destination);
    if (!dest) throw new Error('יעד חו"ל לא נמצא במאגר.');
    var days = params.days;
    var tmplDays = buildAbroadDays(dest, days);

    var docDays = tmplDays.map(function (t, i) {
      var blocks = [
        { when: 'בוקר', what: t.morning, desc: '' },
        { when: 'צהריים', what: t.lunch, desc: '' },
        { when: 'אחה"צ', what: t.afternoon, desc: '' },
        { when: 'ערב', what: t.evening, desc: '' }
      ];
      return { n: i + 1, title: 'יום ' + (i + 1) + ' — ' + t.title, blocks: blocks, tip: t.tip };
    });

    // טבלת תקציב: daily × ימים × אנשים + טווח טיסה לפי עונה
    var people = params.people;
    function dailyMid(cat) { return mid(dest.daily[cat] || [0, 0]); }
    var cats = [
      { cat: 'לינה', key: 'lodging' },
      { cat: 'אוכל', key: 'food' },
      { cat: 'אטרקציות וכניסות', key: 'attractions' },
      { cat: 'תחבורה מקומית', key: 'transport' }
    ];
    var budgetTable = [];
    var noFlightTotal = 0;
    cats.forEach(function (c) {
      var perDayPerson = dailyMid(c.key);
      var perDay = perDayPerson * people;
      var total = perDay * days;
      noFlightTotal += total;
      budgetTable.push({ cat: c.cat, perDay: perDay, total: total });
    });
    budgetTable.push({ cat: 'סה"כ (ללא טיסה)', perDay: null, total: noFlightTotal });

    var tier = flightTier(params.month);
    var flightRange = dest.flight[tier] || dest.flight.regular;
    var flightTotal = mid(flightRange) * people;
    budgetTable.push({ cat: 'טיסה (הלוך-חזור, מנתב"ג)', perDay: null, total: flightTotal });
    budgetTable.push({ cat: 'סה"כ כולל טיסה', perDay: null, total: noFlightTotal + flightTotal });

    var doc = {
      title: dest.name + ' — ' + days + ' ימים',
      overview: dest.why + ' עונה מומלצת: ' + dest.bestSeasons.map(seasonHe).join('/') + '.',
      days: docDays,
      budgetTable: budgetTable,
      packing: buildPacking(params),
      checklist: (DATA().checklist || []).slice(),
      tips: tipsForAbroad(dest, params),
      lodging: null,
      rainAlt: null
    };

    return { kind: 'abroad', trip: null, doc: doc };
  }

  function seasonHe(s) {
    return { spring: 'אביב', summer: 'קיץ', autumn: 'סתיו', winter: 'חורף' }[s] || s;
  }

  // ============================================================================
  // C) GETAWAY — 3 אופציות (זול / יחס מחיר-ערך / פרימיום)
  // ============================================================================

  function planGetaway(params) {
    var d = DATA();
    var important = params.important || null;
    var nights = params.nights || Math.max(1, params.days - 1);

    // סינון אזורים לפי 'distance' (אם הועבר ב-important או region)
    var regionPool = d.regions.slice();
    // טבע → צפון/דרום; קרוב (hour) → מרכז/שפלה/ירושלים
    if (important === 'nature') {
      regionPool = regionPool.filter(function (r) { return ['galil', 'golan', 'ramon', 'deadsea', 'haifa', 'eilat'].indexOf(r.id) !== -1; });
    }
    if (params.region === 'hour' || important === 'hour') {
      regionPool = regionPool.filter(function (r) { return ['merkaz', 'telaviv', 'jerusalem', 'haifa'].indexOf(r.id) !== -1; });
    }
    if (!regionPool.length) regionPool = d.regions.slice();
    var regionIds = regionPool.map(function (r) { return r.id; });

    var tiers = [
      { title: 'זול ומהנה', level: 'budget' },
      { title: 'יחס מחיר-ערך', level: 'mid' },
      { title: 'פרימיום', level: 'premium' }
    ];

    var usedLodging = {};
    var options = tiers.map(function (t) {
      // בחר את הלינה הטובה ביותר ברמה הזו לפי important
      var pool = d.lodging.filter(function (l) {
        return l.level === t.level && regionIds.indexOf(l.region) !== -1 && !usedLodging[l.id];
      });
      if (!pool.length) pool = d.lodging.filter(function (l) { return l.level === t.level && regionIds.indexOf(l.region) !== -1; });
      if (!pool.length) pool = d.lodging.filter(function (l) { return l.level === t.level; });

      pool.sort(function (a, b) {
        var sa = 0, sb = 0;
        if (important === 'pool') { sa += a.pool ? 3 : 0; sb += b.pool ? 3 : 0; }
        if (important === 'romantic' || params.composition.type === 'couple') { sa += a.romantic ? 3 : 0; sb += b.romantic ? 3 : 0; }
        if (params.composition.type === 'family') { sa += a.family ? 2 : 0; sb += b.family ? 2 : 0; }
        return sb - sa;
      });
      var l = pool[0];
      if (l) usedLodging[l.id] = 1;
      var regionObj = d.regions.filter(function (r) { return r.id === (l ? l.region : null); })[0];

      // 2-3 אטרקציות קרובות + מסעדה קרובה
      var lp = l ? { lat: l.lat, lng: l.lng } : (regionObj ? regionObj.center : null);
      var near = d.attractions.filter(function (a) {
        return l && a.region === l.region && seasonOk(a, params.season) && kidsOk(a, params.composition.kidsAges, params.composition.type);
      }).sort(function (a, b) { return haversineKm(lp, a) - haversineKm(lp, b); }).slice(0, 3);
      var rest = l ? nearestRestaurant(l.region, lp, [], params.style) : null;

      var blocks = near.map(function (a) {
        return { when: 'לעשות', what: a.name, desc: a.desc + (a.tip ? ' · ' + a.tip : '') };
      });
      if (rest) blocks.push({ when: 'לאכול', what: rest.name, desc: rest.style + ' · ' + rest.desc + (rest.kosher ? ' · כשר' : '') });
      var dontMiss = near[0] ? near[0].name : (regionObj ? regionObj.name : '');

      var priceNote = l ? ('₪' + l.priceNight[0] + '-' + l.priceNight[1] + ' ללילה') : '';
      var total = l ? mid(l.priceNight) * nights : 0;

      var doc = {
        title: t.title + ' — ' + (l ? l.name : ''),
        overview: (regionObj ? regionObj.name + ': ' + regionObj.desc + ' ' : '') + (l ? l.desc : '') + ' ' + priceNote + '.',
        days: [{ n: 1, title: (l ? l.name : '') + ' וסביבתה', blocks: blocks, tip: dontMiss ? ('לא לפספס: ' + dontMiss) : null }],
        budgetTable: [{ cat: 'לינה (' + nights + ' לילות)', perDay: l ? mid(l.priceNight) : 0, total: total }],
        packing: buildPacking(params),
        checklist: [],
        tips: [],
        lodging: l ? (l.name + ' — ' + l.desc) : null,
        rainAlt: null
      };
      return { title: t.title, lodging: l ? l.name : null, doc: doc };
    });

    return { kind: 'getaway', options: options };
  }

  // ============================================================================
  // D) SURPRISE — 3 הצעות חו"ל (קלאסי / הרפתקה / פינוק) לפי vibe + תקציב + avoid
  // ============================================================================

  function destDailyMidTotal(dest) {
    return mid(dest.daily.lodging) + mid(dest.daily.food) + mid(dest.daily.attractions) + mid(dest.daily.transport);
  }

  function planSurprise(params) {
    var d = DATA();
    var dests = (d.abroad && d.abroad.destinations) || [];
    var days = params.days;
    var budget = params.budgetTotal; // לאדם, כולל טיסה
    var avoid = (params.avoid || '').toString();
    var tier = flightTier(params.month);

    function estCostPerPerson(dest) {
      var daily = destDailyMidTotal(dest);
      var flight = mid(dest.flight[tier] || dest.flight.regular);
      return daily * days + flight;
    }

    // סינון avoid
    function passesAvoid(dest) {
      var heatSensitive = (dest.bestSeasons.indexOf(SU) === -1); // יעד שלא טוב בקיץ = חם בקיץ
      if (avoid.indexOf('חום') !== -1 || avoid.indexOf('heat') !== -1) {
        // הימנע מיעדים שעונת השיא שלהם חמה ושאינם מומלצים בקיץ דווקא בגלל החום (תאילנד וכו')
        if (dest.id === 'thailand') return false;
        if (params.season === SU && heatSensitive) return false;
      }
      if (avoid.indexOf('טיסה ארוכה') !== -1 || avoid.indexOf('long') !== -1) {
        if (dest.timeDiff && dest.timeDiff.indexOf('5 שעות') !== -1) return false;
        if (dest.id === 'thailand') return false;
      }
      // מדינה מסוימת לפי שם
      if (avoid && dest.name && avoid.indexOf(dest.name.split(' ')[0]) !== -1 && avoid.length > 2) return false;
      return true;
    }

    var pool = dests.filter(function (dest) {
      if (!passesAvoid(dest)) return false;
      if (budget != null) return estCostPerPerson(dest) <= budget * 1.05; // 5% גמישות
      return true;
    });
    if (!pool.length) pool = dests.filter(passesAvoid);
    if (!pool.length) pool = dests.slice();

    function pickByVibe(vibe, fallbackSort) {
      var byVibe = pool.filter(function (dst) { return dst.vibe === vibe; });
      var arr = byVibe.length ? byVibe : pool.slice();
      arr = arr.slice().sort(fallbackSort);
      return arr[0];
    }

    var rand = rng(params.seed);
    var classic = pickByVibe('classic', function (a, b) { return estCostPerPerson(a) - estCostPerPerson(b); });
    var adventure = pickByVibe('adventure', function (a, b) { return (rand() - 0.5); });
    var pamper = pickByVibe('pamper', function (a, b) { return estCostPerPerson(b) - estCostPerPerson(a); });

    // הימנע מכפילויות
    var chosen = [];
    function addUnique(dst, label) {
      if (!dst) return;
      if (chosen.some(function (c) { return c.destination.id === dst.id; })) {
        // קח חלופי מהפול
        var alt = pool.filter(function (p) { return !chosen.some(function (c) { return c.destination.id === p.id; }); })[0];
        if (alt) dst = alt; else return;
      }
      var est = estCostPerPerson(dst);
      chosen.push({
        label: label,
        destination: { id: dst.id, name: dst.name, vibe: dst.vibe },
        why: label + ': ' + dst.why,
        estCost: '~' + est.toLocaleString('he-IL') + ' ₪ לאדם (' + days + ' ימים + טיסה ' + seasonHe(params.season || '') + ', עונת ' + tier + ')'
      });
    }
    addUnique(classic, 'הקלאסי שלא חשבת עליו');
    addUnique(adventure, 'ההרפתקה');
    addUnique(pamper, 'הפינוק');

    // מילוי עד 3 אם חסר
    while (chosen.length < 3) {
      var fill = pool.filter(function (p) { return !chosen.some(function (c) { return c.destination.id === p.id; }); })[0];
      if (!fill) break;
      addUnique(fill, 'בונוס');
    }

    return { kind: 'surprise', suggestions: chosen };
  }

  // ============================================================================
  // נקודת הכניסה הציבורית
  // ============================================================================

  function plan(rawParams) {
    DATA(); // יזרוק Error ידידותי אם המאגר חסר
    var params = normalizeParams(rawParams);
    switch (params.kind) {
      case 'israel':   return planIsrael(params);
      case 'abroad':   return planAbroad(params);
      case 'getaway':  return planGetaway(params);
      case 'surprise': return planSurprise(params);
      default:         return planIsrael(params);
    }
  }

  window.TripPlannerEngine = {
    plan: plan,
    haversineKm: haversineKm,
    buildPacking: function (p) { DATA(); return buildPacking(normalizeParams(p)); },
    monthToSeason: monthToSeason
  };

})();
