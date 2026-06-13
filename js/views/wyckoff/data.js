(function () {
  'use strict';
  // ── wyckoff/data.js — שכבת נתונים חיים (Binance public REST) → window.WyckoffData ──
  // אחריות יחידה: למשוך נרות רב-טווחיים מבורסה ציבורית ולנרמל למבנה אחיד.
  // אפס תלות בקלוד/בסקיל/בשרת — fetch ישיר מהדפדפן (CORS פתוח, אומת).
  // ספק ברירת-מחדל: Binance. fallback: Bybit. הכל client-side.

  var BINANCE = 'https://api.binance.com/api/v3/klines';
  var BYBIT   = 'https://api.bybit.com/v5/market/kline';

  // מיפוי טווחי-זמן לפורמט כל ספק
  var TF = {
    d:   { binance: '1d',  bybit: 'D',   label: 'יומי' },
    h4:  { binance: '4h',  bybit: '240', label: '4 שעות' },
    h1:  { binance: '1h',  bybit: '60',  label: 'שעתי' },
    m15: { binance: '15m', bybit: '15',  label: '15 דקות' }
  };

  // נר מנורמל: {t (ms), o,h,l,c,v}
  function fromBinance(rows) {
    return rows.map(function (r) {
      return { t: r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] };
    });
  }
  function fromBybit(list) {
    // Bybit מחזיר newest→oldest; הופכים ל-oldest→newest
    return list.map(function (r) {
      return { t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] };
    }).reverse();
  }

  function fetchBinance(symbol, tfKey, limit) {
    var url = BINANCE + '?symbol=' + encodeURIComponent(symbol) +
      '&interval=' + TF[tfKey].binance + '&limit=' + limit;
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('binance ' + r.status);
      return r.json();
    }).then(fromBinance);
  }

  function fetchBybit(symbol, tfKey, limit) {
    var url = BYBIT + '?category=spot&symbol=' + encodeURIComponent(symbol) +
      '&interval=' + TF[tfKey].bybit + '&limit=' + limit;
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('bybit ' + r.status);
      return r.json();
    }).then(function (j) {
      if (!j.result || !j.result.list) throw new Error('bybit empty');
      return fromBybit(j.result.list);
    });
  }

  // משיכת טווח יחיד עם fallback אוטומטי בין הספקים
  function fetchTF(symbol, tfKey, limit, provider) {
    var primary = provider === 'bybit' ? fetchBybit : fetchBinance;
    var backup  = provider === 'bybit' ? fetchBinance : fetchBybit;
    return primary(symbol, tfKey, limit).catch(function () {
      return backup(symbol, tfKey, limit);
    });
  }

  // משיכת כל הטווחים במקביל. מחזיר Promise<{d,h4,h1,m15, source}>
  function fetchAll(symbol, provider) {
    symbol = (symbol || 'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g, '');
    var limits = { d: 180, h4: 200, h1: 200, m15: 120 };
    return Promise.all([
      fetchTF(symbol, 'd', limits.d, provider),
      fetchTF(symbol, 'h4', limits.h4, provider),
      fetchTF(symbol, 'h1', limits.h1, provider),
      fetchTF(symbol, 'm15', limits.m15, provider)
    ]).then(function (a) {
      if (!a[0] || !a[0].length) throw new Error('אין נתונים לסימבול — בדקו את שם הזוג (למשל BTCUSDT)');
      return { symbol: symbol, d: a[0], h4: a[1], h1: a[2], m15: a[3], tf: TF };
    });
  }

  window.WyckoffData = { fetchAll: fetchAll, TF: TF };
})();
