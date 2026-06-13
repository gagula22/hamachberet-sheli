(function () {
  'use strict';
  // ── wyckoff/engine.js — מנוע ניתוח וויקוף דטרמיניסטי → window.WyckoffEngine ──
  // אחריות יחידה: לוגיקה טהורה שמקודדת את method.md של הסקיל. אפס DOM/רשת/תלות
  // ב-LLM. מקבל נרות רב-טווחיים ומחזיר ניתוח מלא: SC/AR, טווח, היצע/ביקוש, V/1%,
  // צ'ק-ליסט 8 שאלות, פסיקת GO/WAIT/NO-GO, ו-3 תרחישים עם רמות אמיתיות.
  //
  // ⚠️ זהו קירוב דטרמיניסטי של ההיריסטיקות — משתחזר ומהיר, בלי השיפוט החופשי של LLM.

  function mean(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : 0; }
  function rng(c) { return c.h - c.l; }
  function pct(n) { return Math.round(n * 10) / 10; }
  function money(n) {
    if (n >= 1000) return '$' + Math.round(n).toLocaleString('en-US');
    if (n >= 1) return '$' + (Math.round(n * 100) / 100).toLocaleString('en-US');
    return '$' + (Math.round(n * 1e6) / 1e6);
  }

  // ── זיהוי Selling Climax / עוגן-תחתית הטווח ──
  // מאתר את השפל המבני בחלון (תחתית הטווח), ומעדיף נר נפח-שיא בסביבתו (SC קלאסי).
  // אם השפל הוא ב-3 הנרות האחרונים — המחיר עוד יורד, אין טווח מאומת → -1.
  function detectSC(candles, win) {
    win = Math.min(win || 40, candles.length);
    var w = candles.slice(candles.length - win);
    var base = candles.length - win;
    // השפל הנמוך ביותר בחלון
    var loIdx = 0, lo = Infinity;
    w.forEach(function (c, i) { if (c.l < lo) { lo = c.l; loIdx = i; } });
    if (loIdx >= win - 3) return -1;                        // שפל טרי = עדיין יורד
    // העדפת נר נפח-שיא בטווח ±2 נרות מהשפל (ה-SC הקלאסי), אחרת השפל עצמו
    var best = loIdx, bestV = w[loIdx].v;
    for (var i = Math.max(0, loIdx - 2); i <= Math.min(win - 1, loIdx + 2); i++) {
      if (w[i].v > bestV && w[i].l < lo * 1.025) { bestV = w[i].v; best = i; }
    }
    return base + best;
  }

  // ── Automatic Rally: השיא הגבוה ביותר ב-N נרות אחרי ה-SC ──
  function detectAR(candles, scIdx) {
    if (scIdx < 0) return -1;
    var end = Math.min(scIdx + 7, candles.length - 1);
    var best = -1, bestH = -Infinity;
    for (var i = scIdx + 1; i <= end; i++) {
      if (candles[i].h > bestH) { bestH = candles[i].h; best = i; }
    }
    return best;
  }

  // ── קריאת שליטה (היצע/ביקוש) מהנפח על חלון אחרון ──
  function controlRead(candles) {
    var n = Math.min(20, candles.length);
    var w = candles.slice(candles.length - n);
    var upV = [], dnV = [];
    w.forEach(function (c) { (c.c >= c.o ? upV : dnV).push(c.v); });
    var half = Math.floor(w.length / 2);
    function trend(arr, firstHalf, secondHalf) {
      var a = mean(firstHalf), b = mean(secondHalf);
      if (!a || !b) return 0;
      return (b - a) / a; // חיובי = עולה, שלילי = יורד
    }
    var dnFirst = [], dnSecond = [], upFirst = [], upSecond = [];
    w.forEach(function (c, i) {
      var down = c.c < c.o;
      if (down) (i < half ? dnFirst : dnSecond).push(c.v);
      else (i < half ? upFirst : upSecond).push(c.v);
    });
    var supplyTrend = trend(null, dnFirst, dnSecond);   // נפח ירידות: שלילי = supply decrease (שורי)
    var demandTrend = trend(null, upFirst, upSecond);   // נפח עליות: שלילי = no demand (דובי)
    var last = w[w.length - 1];
    // הכרעה
    var tag, why;
    if (supplyTrend < -0.15 && demandTrend >= -0.1) {
      tag = '🟢 הקונים מתחזקים'; why = 'נפח הירידות פוחת לאורך זמן (Supply Decrease) — המוכרים מתעייפים.';
    } else if (demandTrend < -0.15) {
      tag = '🔴 מוכרים בתקרה'; why = 'נפח העליות מתייבש (No Demand) — אין ביקוש שמלווה את העלייה.';
    } else if (supplyTrend > 0.15) {
      tag = '🔴 מוכרים מתחזקים'; why = 'נפח הירידות גובר — ההיצע אגרסיבי.';
    } else {
      tag = '⚪ מעורב'; why = 'אין מגמת-נפח מובהקת — איזון היצע/ביקוש.';
    }
    return { tag: tag, why: why, supplyTrend: supplyTrend, demandTrend: demandTrend, avgV: mean(w.map(function (c) { return c.v; })), lastV: last.v };
  }

  // ── ניתוח טווח-זמן יחיד: SC/AR, טווח, שלב, תודעה ──
  function analyzeTF(candles, tfName) {
    var scIdx = detectSC(candles, tfName === 'd' ? 40 : 50);
    var arIdx = detectAR(candles, scIdx);
    var ctrl = controlRead(candles);
    var last = candles[candles.length - 1];
    var sup = null, res = null, phase = '—', structure = 'לא מזוהה TR ברור', event = '—';

    if (scIdx >= 0) {
      sup = candles[scIdx].l;
      // התנגדות הטווח = השיא הגבוה ביותר מאז ה-SC (גג מבני יציב יותר מ-AR בלבד)
      res = Math.max.apply(null, candles.slice(scIdx).map(function (c) { return c.h; }));
      structure = 'אקומולציה (טווח ' + money(sup) + '–' + money(res) + ')';
      // מיקום בטווח
      var posInRange = (last.c - sup) / (res - sup);
      // היריסטיקת שלב
      var sweptBelow = last.l < sup * 1.001 && last.c > sup;       // ספרינג אפשרי
      var brokeAbove = last.c > res * 1.001;                       // SOS אפשרי
      if (brokeAbove) { phase = 'D'; event = 'פריצת SOS אפשרית מעל ' + money(res); }
      else if (sweptBelow) { phase = 'C'; event = 'ספרינג אפשרי מתחת ' + money(sup); }
      else { phase = 'B'; event = posInRange > 0.8 ? 'בדיקת תקרה (~' + money(res) + ')' : (posInRange < 0.2 ? 'בדיקת תמיכה (~' + money(sup) + ')' : 'דשדוש באמצע הטווח'); }
    }

    // תודעה (Bullish/Bearish/Neutral × עוצמה)
    var conv, strength = 'בינוני';
    var posInRange2 = sup != null ? (last.c - sup) / (res - sup) : 0.5;
    if (ctrl.tag.indexOf('🟢') === 0) conv = 'שורי';
    else if (ctrl.tag.indexOf('🔴') === 0) conv = 'דובי';
    else conv = 'ניטרלי';
    // ליד תקרה עם no-demand → דובי-קל גם אם הרקע שורי
    if (sup != null && posInRange2 > 0.8 && ctrl.demandTrend < -0.1) { conv = 'דובי-קל'; strength = 'בינוני'; }
    if (Math.abs(ctrl.supplyTrend) < 0.1 && Math.abs(ctrl.demandTrend) < 0.1) strength = 'נמוך';

    return {
      scIdx: scIdx, arIdx: arIdx, sup: sup, res: res, phase: phase,
      structure: structure, event: event, control: ctrl,
      conviction: conv, strength: strength,
      note: ctrl.why
    };
  }

  // ── טבלת V/1% לאירועי מפתח (טווח יומי) ──
  function v1Table(candles, scIdx, arIdx) {
    var rows = [];
    function add(i, ev) {
      if (i < 0 || i >= candles.length) return;
      var c = candles[i];
      var rangePct = (c.h - c.l) / c.l * 100;
      var v1 = rangePct > 0 ? c.v / rangePct : 0;
      var ratio = null;
      rows.push({ i: i, date: fmtDate(c.t), ev: ev, vol: c.v, rangePct: pct(rangePct), v1: Math.round(v1) });
    }
    add(scIdx, 'SC');
    add(arIdx, 'AR');
    // 3 הנרות האחרונים
    for (var k = Math.max(0, candles.length - 3); k < candles.length; k++) {
      if (k !== scIdx && k !== arIdx) add(k, 'נר אחרון');
    }
    // baseline + פירוש
    var avgV1 = mean(rows.map(function (r) { return r.v1; })) || 1;
    rows.forEach(function (r) {
      var x = r.v1 / avgV1;
      r.meaning = x >= 2 ? '🚨 קלימקטי — אירוע מובהק' : x >= 1.5 ? 'מאמץ עולה — סיגנל מתקרב' : x >= 1 ? 'רגיל — המשך' : x >= 0.5 ? 'נמוך — תקין ל-Phase B' : 'חוסר ביקוש/היצע';
    });
    return rows;
  }

  function fmtDate(ms) {
    var d = new Date(ms);
    return ('0' + d.getUTCDate()).slice(-2) + '/' + ('0' + (d.getUTCMonth() + 1)).slice(-2);
  }

  // ── תרחישים מרמות הטווח ──
  function buildScenarios(sup, res) {
    if (sup == null || res == null || res <= sup) return [];
    var W = res - sup, M = sup + W / 2;
    function rr(entry, sl, tp) { return Math.round(Math.abs(tp - entry) / Math.abs(entry - sl) * 10) / 10; }
    var sE = sup + W * 0.06, sSL = sup - W * 0.09, sTP1 = M, sTP2 = res, sTP3 = res + W;
    var bE = res + W * 0.01, bSL = res - W * 0.06, bTP1 = res + W * 0.5, bTP2 = res + W, bTP3 = res + W * 1.5;
    var uE = res - W * 0.02, uSL = res + W * 0.05, uTP1 = M, uTP2 = sup + W * 0.05, uTP3 = sup;
    return [
      { kind: 'long', title: '🟢 לונג A — ספרינג (המועדף)',
        tf: 'מבנה יומי+4H · טריגר ספרינג+טסט ב-15m',
        cond: 'שטיפה מתחת ' + money(sup) + ' → ריקליים מעל ' + money(sup * 1.005) + ' + טסט 15ד\' בנפח ≤60%',
        trigger: 'ניעור (sweep) מתחת ' + money(sup) + ' + ריקליים מהיר עם נר היפוך 15m/1H',
        entry: sE, sl: sSL, tp1: sTP1, tp2: sTP2, tp3: sTP3, rr: rr(sE, sSL, sTP2) },
      { kind: 'break', title: '🔵 לונג B — פריצת SOS (שמרני)',
        tf: 'מבנה בסגירת נר יומי · טריגר חזרה ל-BU ב-1H/15m',
        cond: 'נר יומי נסגר מעל ' + money(res) + ' בנפח פי 2–3 → BU/חזרה לתקרה → טריגר',
        trigger: 'סגירת יומי/4H מעל ' + money(res) + ' בנפח פי 2–3, ואז פולבק LPS',
        entry: bE, sl: bSL, tp1: bTP1, tp2: bTP2, tp3: bTP3, rr: rr(bE, bSL, bTP2) },
      { kind: 'short', title: '🔴 שורט — UT/דחייה בתקרה',
        tf: 'מבנה 4H/1H · טריגר LPSY נכשל ב-15m',
        cond: 'פריצה כוזבת מעל ' + money(res) + ' → סגירה בחזרה בטווח + LPSY שנכשל',
        trigger: 'דחייה ב-' + money(res) + ' עם נר בליעה דובי + נפח פריצה חלש (No Demand)',
        entry: uE, sl: uSL, tp1: uTP1, tp2: uTP2, tp3: uTP3, rr: rr(uE, uSL, uTP1) }
    ];
  }

  // ── צ'ק-ליסט 8 השאלות + פסיקה ──
  function checklistAndVerdict(D, last, scenarios, isBTC, btcBias) {
    var sup = D.sup, res = D.res, price = last.c;
    var posInRange = sup != null ? (price - sup) / (res - sup) : 0.5;
    var nearSup = sup != null && Math.abs(price - sup) / (res - sup) < 0.12;
    var nearRes = sup != null && Math.abs(price - res) / (res - sup) < 0.12;
    var eventPhase = (D.phase === 'C' || D.phase === 'D');
    var bestRR = scenarios.length ? Math.max.apply(null, scenarios.map(function (s) { return s.rr; })) : 0;

    var ck = [
      { n: 1, label: 'הטיה יומית/שבועית בכיוון העסקה?', state: eventPhase ? 'yes' : 'no',
        note: eventPhase ? 'אירוע שלב ' + D.phase + ' מספק כיוון' : 'Phase B ניטרלי — אין הטיה מובהקת' },
      { n: 2, label: 'שלב C/D עם אירוע מאומת-נפח?', state: eventPhase ? 'yes' : 'no',
        note: eventPhase ? D.event : 'אנחנו ב-Phase B. אין ספרינג/SOS' },
      { n: 3, label: 'מחיר באזור מסומן עם קונפלואנס?', state: (nearSup || nearRes) ? 'part' : 'no',
        note: nearRes ? 'בתקרה — אזור שורט-לצפייה, לא לונג' : nearSup ? 'ליד תמיכה — אזור לונג פוטנציאלי' : 'אמצע הטווח — לא אזור' },
      { n: 4, label: 'טריגר 15/30 דק\' + נפח טסט 40–60%?', state: 'no',
        note: 'אין נר טריגר מאומת ברגע זה' },
      { n: 5, label: 'R:R ≥ 3?', state: bestRR >= 3 ? 'part' : 'no',
        note: 'תרחיש מיטבי R:R ≈ ' + bestRR + (bestRR >= 3 ? ' — אך לא פעיל' : '') },
      { n: 6, label: 'סיכון ≤ 1% וחום תיק ≤ 6%?', state: 'yes', note: 'גודל ייקבע ל-1% בכניסה בפועל' },
      { n: 7, label: '(אלט) BTC מיושר?',
        state: isBTC ? 'yes' : (/דובי/.test(btcBias || '') ? 'no' : 'yes'),
        note: isBTC ? 'זהו BTC עצמו' : (/דובי/.test(btcBias || '') ? 'BTC דובי — אלט-לונג נחלש (חוק הביטקוין)' : 'BTC ' + (btcBias || 'ניטרלי') + ' — מיושר') },
      { n: 8, label: 'OI/פאנדינג לא סותרים?', state: 'warn', note: 'לא נבדק — נתוני ספוט בלבד' }
    ];

    var critical = ck.slice(0, 4).filter(function (q) { return q.state === 'yes'; }).length;
    var verdict, why;
    if (eventPhase && (nearSup || nearRes) && critical >= 3) {
      verdict = 'GO'; why = 'אירוע שלב ' + D.phase + ' באזור מסומן — תוכנית כניסה מוכנה.';
    } else if (D.phase === 'D' && nearRes && D.control.demandTrend < -0.15) {
      verdict = 'NO-GO'; why = 'פריצה לתקרה בנפח דועך (UT) — סתירה. להישאר בחוץ.';
    } else {
      verdict = 'WAIT';
      why = sup == null ? 'אין TR מאומת — המתן להתבססות.' :
        posInRange > 0.8 ? 'Phase B, מחיר בראש הטווח על נפח חלש — לא אזור כניסה. המתן לספרינג או SOS.' :
        posInRange < 0.2 ? 'Phase B ליד תמיכה — המתן לאישור ספרינג + טריגר.' :
        'אמצע טווח ללא טריגר — המתן לרמת מפתח.';
    }
    return { checklist: ck, verdict: verdict, why: why, critical: critical };
  }

  // ── הניתוח המרכזי ──
  function analyze(bundle, opts) {
    opts = opts || {};
    var isBTC = /^BTC/.test(bundle.symbol || '');
    if (!bundle || !bundle.d || !bundle.d.length) throw new Error('אין נתונים לניתוח');
    var D = analyzeTF(bundle.d, 'd');
    var H4 = analyzeTF(bundle.h4, 'h4');
    var H1 = analyzeTF(bundle.h1, 'h1');
    var last = bundle.d[bundle.d.length - 1];
    var lastPrice = bundle.m15 && bundle.m15.length ? bundle.m15[bundle.m15.length - 1].c : last.c;

    var scenarios = buildScenarios(D.sup, D.res);
    var cv = checklistAndVerdict(D, { c: lastPrice }, scenarios, isBTC, opts.btcBias);

    // שליטה כוללת
    function score(tf) { return tf.control.tag.indexOf('🟢') === 0 ? 1 : tf.control.tag.indexOf('🔴') === 0 ? -1 : 0; }
    var net = score(D) * 1.4 + score(H4) + score(H1);
    var overall = net > 0.6 ? '🟢 הקונים שולטים' : net < -0.6 ? '🔴 המוכרים שולטים' : '🟠 קרב נחוש / מעורב';

    // 15m setup + קריאת שליטה ברגע הטריגר
    var m15Setup = cv.verdict === 'GO' ? 'Primary — יש כניסה' : 'חכה — אין טריגר';
    var m15read = (bundle.m15 && bundle.m15.length) ? controlRead(bundle.m15) : null;

    // התראות מומלצות (רמות מפתח לחמש)
    var alerts = [];
    if (D.sup != null) {
      alerts.push(D.sup * 1.012);   // מעל התמיכה — קדם-ספרינג
      alerts.push(D.res * 1.001);   // פריצת התקרה — קדם-SOS
      alerts.push(D.res * 1.012);   // מעל התקרה — אזור UT
    }

    return {
      symbol: bundle.symbol,
      price: lastPrice,
      asof: new Date(last.t),
      verdict: cv.verdict,
      verdictWhy: cv.why,
      range: D.sup != null ? { sup: D.sup, res: D.res, mid: (D.sup + D.res) / 2, width: D.res - D.sup } : null,
      tfs: { d: D, h4: H4, h1: H1 },
      overall: overall,
      m15Setup: m15Setup,
      m15read: m15read,
      alerts: alerts,
      v1Table: v1Table(bundle.d, D.scIdx, D.arIdx),
      checklist: cv.checklist,
      scenarios: scenarios,
      money: money
    };
  }

  window.WyckoffEngine = { analyze: analyze, money: money, detectSC: detectSC, detectAR: detectAR };
})();
