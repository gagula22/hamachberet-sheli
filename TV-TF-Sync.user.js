// ==UserScript==
// @name         TradingView TF Group Sync (6 charts)
// @namespace    maoz.tv.tfsync
// @version      1.2
// @description  שינוי חלון עליון ל-4h/שעתי מסנכרן את כל העליונים, והתחתונים עוברים ל-30/15 דקות בהתאמה (פריסת 6 מסכים)
// @updateURL    https://gagula22.github.io/hamachberet-sheli/TV-TF-Sync.user.js
// @downloadURL  https://gagula22.github.io/hamachberet-sheli/TV-TF-Sync.user.js
// @match        https://*.tradingview.com/chart/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  const TOP = ['240', '60'];               // timeframes the user controls from a top chart
  const MAP = { '240': '30', '60': '15' }; // top → bottom mapping
  let prev = null, topIdx = null, botIdx = null;

  function readCharts() {
    const api = window.TradingViewApi;
    if (!api) return null;
    let n; try { n = api.chartsCount(); } catch (e) { return null; }
    if (n !== 6) { topIdx = botIdx = prev = null; return null; }
    const res = [];
    for (let i = 0; i < 6; i++) { try { res.push(String(api.chart(i).resolution())); } catch (e) { res.push(null); } }
    return res;
  }

  setInterval(() => {
    try {
      const res = readCharts();
      if (!res) return;
      if (!topIdx) {
        const t = [], b = [];
        res.forEach((v, i) => { if (TOP.includes(v)) t.push(i); else if (['30', '15'].includes(v)) b.push(i); });
        if (t.length === 3 && b.length === 3) { topIdx = t; botIdx = b; prev = res; console.log('[TF-Sync] פעיל — עליונים:', t.join(','), 'תחתונים:', b.join(',')); }
        return;
      }
      let mode = null;
      for (const i of topIdx) if (res[i] !== prev[i] && TOP.includes(res[i])) { mode = res[i]; break; }
      if (mode) {
        const api = window.TradingViewApi;
        for (const i of topIdx) if (res[i] !== mode) api.chart(i).setResolution(mode, {});
        for (const i of botIdx) if (res[i] !== MAP[mode]) api.chart(i).setResolution(MAP[mode], {});
        console.log('[TF-Sync] מצב ' + (mode === '240' ? '4 שעות / 30 דקות' : 'שעה / 15 דקות'));
      }
      prev = res;
    } catch (e) {}
  }, 1500);
})();
